import React, { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@/components/AppIcon';
import { useColors } from '@/hooks/useColors';

export interface Option {
  value: string;
  label: string;
  sublabel?: string;
}

interface Props {
  placeholder: string;
  options: Option[];
  value: string | null;
  onChange: (value: string) => void;
  onDeleteOption?: (value: string) => void;
  testID?: string;
}

export default function Dropdown({
  placeholder,
  options,
  value,
  onChange,
  onDeleteOption,
  testID,
}: Props) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          { backgroundColor: colors.card, borderColor: colors.border },
          pressed && { opacity: 0.7 },
        ]}
        testID={testID}
      >
        <Text
          style={[
            styles.triggerText,
            { color: selected ? colors.foreground : colors.mutedForeground },
          ]}
          numberOfLines={1}
        >
          {selected ? selected.label : placeholder}
        </Text>
        <Feather name="chevron-down" size={18} color={colors.mutedForeground} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.sheetTitle, { color: colors.mutedForeground }]}>
              {placeholder}
            </Text>
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: colors.mutedForeground }]}>
                  No items
                </Text>
              }
              renderItem={({ item }) => (
                <View style={styles.optionRow}>
                  <Pressable
                    onPress={() => { onChange(item.value); setOpen(false); }}
                    style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        {
                          color: item.value === value ? colors.accent : colors.foreground,
                          fontFamily: item.value === value ? 'Inter_600SemiBold' : 'Inter_400Regular',
                        },
                      ]}
                      numberOfLines={2}
                    >
                      {item.label}
                    </Text>
                    {item.sublabel ? (
                      <Text style={[styles.sublabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {item.sublabel}
                      </Text>
                    ) : null}
                  </Pressable>
                  {onDeleteOption && (
                    <Pressable
                      onPress={() => onDeleteOption(item.value)}
                      style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.5 }]}
                    >
                      <Feather name="trash-2" size={16} color={colors.destructive} />
                    </Pressable>
                  )}
                </View>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  triggerText: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium', marginRight: 8 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: { borderRadius: 16, padding: 16, maxHeight: '70%' },
  sheetTitle: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  optionRow: { flexDirection: 'row', alignItems: 'center' },
  option: { flex: 1, paddingVertical: 12 },
  optionText: { fontSize: 15 },
  sublabel: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  deleteBtn: { padding: 10 },
  empty: { fontSize: 14, fontFamily: 'Inter_400Regular', paddingVertical: 16, textAlign: 'center' },
});
