import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Feather } from '@/components/AppIcon';

interface Props {
  visible: boolean;
  uri?: string;
  title?: string;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

export default function ImageViewerModal({ visible, uri, title, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const { width: winWidth, height: winHeight } = useWindowDimensions();

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const containerWidth = winWidth;
  const containerHeight = winHeight * 0.75;

  const resetZoom = (animated = true) => {
    'worklet';
    if (animated) {
      scale.value = withTiming(1);
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
    } else {
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
    }
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const clampTranslation = (nextScale: number) => {
    'worklet';
    const maxX = (containerWidth * (nextScale - 1)) / 2;
    const maxY = (containerHeight * (nextScale - 1)) / 2;
    translateX.value = clamp(translateX.value, -maxX, maxX);
    translateY.value = clamp(translateY.value, -maxY, maxY);
  };

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = clamp(savedScale.value * e.scale, MIN_SCALE, MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value <= MIN_SCALE) {
        resetZoom();
      } else {
        savedScale.value = scale.value;
        clampTranslation(scale.value);
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }
    });

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      const maxX = (containerWidth * (scale.value - 1)) / 2;
      const maxY = (containerHeight * (scale.value - 1)) / 2;
      translateX.value = clamp(savedTranslateX.value + e.translationX, -maxX, maxX);
      translateY.value = clamp(savedTranslateY.value + e.translationY, -maxY, maxY);
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > 1) {
        resetZoom();
      } else {
        const nextScale = DOUBLE_TAP_SCALE;
        // Zoom toward the tap point
        const focalX = e.x - containerWidth / 2;
        const focalY = e.y - containerHeight / 2;
        const maxX = (containerWidth * (nextScale - 1)) / 2;
        const maxY = (containerHeight * (nextScale - 1)) / 2;
        scale.value = withTiming(nextScale);
        translateX.value = withTiming(clamp(-focalX * (nextScale - 1), -maxX, maxX));
        translateY.value = withTiming(clamp(-focalY * (nextScale - 1), -maxY, maxY));
        savedScale.value = nextScale;
        savedTranslateX.value = clamp(-focalX * (nextScale - 1), -maxX, maxX);
        savedTranslateY.value = clamp(-focalY * (nextScale - 1), -maxY, maxY);
      }
    });

  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .requireExternalGestureToFail(doubleTapGesture)
    .onEnd(() => {
      if (scale.value <= 1) {
        runOnJS(onClose)();
      }
    });

  const composedGesture = Gesture.Race(
    Gesture.Simultaneous(pinchGesture, panGesture),
    Gesture.Exclusive(doubleTapGesture, singleTapGesture),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const handleClose = () => {
    resetZoom(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      onShow={() => resetZoom(false)}
    >
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.backdrop} testID="image-viewer-backdrop">
          <Pressable style={styles.closeBtn} onPress={handleClose} testID="image-viewer-close">
            <Feather name="x" size={26} color="#FFFFFF" />
          </Pressable>
          {uri && !failed ? (
            <GestureDetector gesture={composedGesture}>
              <View
                style={[styles.imageWrap, { width: containerWidth, height: containerHeight }]}
                collapsable={false}
              >
                {loading && (
                  <ActivityIndicator size="large" color="#FFFFFF" style={styles.spinner} />
                )}
                <Animated.Image
                  source={{ uri }}
                  style={[styles.image, animatedStyle]}
                  resizeMode="contain"
                  onLoadStart={() => { setLoading(true); setFailed(false); }}
                  onLoadEnd={() => setLoading(false)}
                  onError={() => { setLoading(false); setFailed(true); }}
                />
              </View>
            </GestureDetector>
          ) : (
            <Pressable onPress={handleClose}>
              <Text style={styles.errorText}>이미지를 불러올 수 없습니다</Text>
            </Pressable>
          )}
          {!!title && (
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 52,
    right: 20,
    zIndex: 2,
    padding: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  imageWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  spinner: { position: 'absolute', zIndex: 1 },
  errorText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  title: {
    position: 'absolute',
    bottom: 48,
    left: 24,
    right: 24,
    color: '#FFFFFF',
    textAlign: 'center',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
});
