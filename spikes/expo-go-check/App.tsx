import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HOST, runAllChecks, type CheckResult } from './checks';

export default function App() {
  const [results, setResults] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setResults([]);
    setRunning(true);
    await runAllChecks((result) => setResults((previous) => [...previous, result]));
    setRunning(false);
  };

  const passed = results.filter((r) => r.ok).length;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>ChainChat · Expo Go spike</Text>
        <Text style={styles.subtitle}>Mac: {HOST}</Text>

        <Pressable style={[styles.button, running && styles.buttonDisabled]} onPress={run} disabled={running}>
          <Text style={styles.buttonText}>{running ? 'Running…' : 'Run checks'}</Text>
        </Pressable>

        {results.map((r) => (
          <View key={r.name} style={[styles.card, r.ok ? styles.pass : styles.fail]}>
            <Text style={styles.cardTitle}>
              {r.ok ? '✅' : '❌'} {r.name}
            </Text>
            <Text style={styles.cardDetail}>
              {r.detail} · {r.ms} ms
            </Text>
          </View>
        ))}

        {!running && results.length > 0 && (
          <Text style={styles.summary}>
            {passed} / {results.length} passed
          </Text>
        )}
      </ScrollView>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f7f9', paddingTop: 50 },
  content: { padding: 16, gap: 10 },
  title: { fontSize: 22, fontWeight: '700', marginTop: 12 },
  subtitle: { color: '#666', marginBottom: 6 },
  button: { backgroundColor: '#3b5bdb', padding: 14, borderRadius: 10, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: 'white', fontWeight: '600', fontSize: 16 },
  card: { padding: 12, borderRadius: 10, borderWidth: 1 },
  pass: { backgroundColor: '#ebfbee', borderColor: '#b2f2bb' },
  fail: { backgroundColor: '#fff5f5', borderColor: '#ffc9c9' },
  cardTitle: { fontWeight: '600' },
  cardDetail: { color: '#444', marginTop: 4, fontSize: 13 },
  summary: { textAlign: 'center', fontSize: 18, fontWeight: '700', marginTop: 8 },
});
