import React from 'react';
import { Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

// OAuth redirect target: /auth#code=...
// On web this closes the login popup; on native the deep-link handler in
// AppContext consumes the code. Either way, just go home.
WebBrowser.maybeCompleteAuthSession();

export default function AuthRedirect() {
  return <Redirect href="/" />;
}
