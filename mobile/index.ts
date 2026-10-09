// App entry point. The polyfill must load before anything else: viem and tweetnacl need crypto.getRandomValues.
import 'react-native-get-random-values';
import 'expo-router/entry';
