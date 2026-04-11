import { connection } from '@/lib/connection'
import {
  type SavedMachine,
  loadMachines,
  removeMachineToken,
  saveLastMachineId,
  saveMachines,
} from '@/lib/storage'
import { useConnectionStatus } from '@/lib/store'
import { colors, fontSize, radius, spacing } from '@/theme/colors'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function ConnectScreen() {
  const status = useConnectionStatus()
  const insets = useSafeAreaInsets()

  const [machines, setMachines] = useState<SavedMachine[]>([])
  const [mode, setMode] = useState<'username' | 'ip'>('username')
  const [username, setUsername] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('9876')
  const [token, setToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadMachines().then(setMachines)
  }, [])

  useEffect(() => {
    if (status === 'connected') {
      setConnecting(false)
      setError(null)
      router.replace('/(tabs)')
    } else if (status === 'error') {
      setConnecting(false)
      setError('Connection failed. Check your credentials.')
    }
  }, [status])

  const handleConnect = useCallback(async () => {
    Keyboard.dismiss()
    setError(null)
    setConnecting(true)

    const config =
      mode === 'username'
        ? {
            host: `${username}.antoncomputer.in`,
            port: 443,
            token,
            useTLS: true,
          }
        : {
            host,
            port: Number.parseInt(port, 10) || 9876,
            token,
            useTLS: false,
          }

    if (!config.host || !config.token) {
      setError('Please fill in all fields')
      setConnecting(false)
      return
    }

    // Save machine
    const machineId = `${config.host}:${config.port}`
    const machine: SavedMachine = {
      id: machineId,
      name: mode === 'username' ? username : config.host,
      host: config.host,
      port: config.port,
      token: config.token,
      useTLS: config.useTLS,
    }
    const updated = [machine, ...machines.filter((m) => m.id !== machineId)]
    setMachines(updated)
    await saveMachines(updated)
    await saveLastMachineId(machineId)

    connection.connect(config)
  }, [mode, username, host, port, token, machines])

  const handleQuickConnect = useCallback(async (machine: SavedMachine) => {
    setConnecting(true)
    setError(null)
    await saveLastMachineId(machine.id)
    connection.connect({
      host: machine.host,
      port: machine.port,
      token: machine.token,
      useTLS: machine.useTLS,
    })
  }, [])

  const handleDeleteMachine = useCallback(
    (id: string) => {
      Alert.alert('Remove Machine', 'Remove this saved connection?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const updated = machines.filter((m) => m.id !== id)
            setMachines(updated)
            await saveMachines(updated)
            await removeMachineToken(id)
          },
        },
      ])
    },
    [machines],
  )

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>Anton</Text>
          <Text style={styles.subtitle}>Connect to your agent</Text>
        </View>

        {/* Saved machines */}
        {machines.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Saved Machines</Text>
            {machines.map((m) => (
              <Pressable
                key={m.id}
                style={styles.machineCard}
                onPress={() => handleQuickConnect(m)}
                onLongPress={() => handleDeleteMachine(m.id)}
              >
                <View style={styles.machineDot} />
                <View style={styles.machineInfo}>
                  <Text style={styles.machineName}>{m.name}</Text>
                  <Text style={styles.machineHost}>
                    {m.host}:{m.port}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* Connection form */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>New Connection</Text>

          {/* Mode toggle */}
          <View style={styles.modeToggle}>
            <Pressable
              style={[styles.modeBtn, mode === 'username' && styles.modeBtnActive]}
              onPress={() => setMode('username')}
            >
              <Text style={[styles.modeBtnText, mode === 'username' && styles.modeBtnTextActive]}>
                Username
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeBtn, mode === 'ip' && styles.modeBtnActive]}
              onPress={() => setMode('ip')}
            >
              <Text style={[styles.modeBtnText, mode === 'ip' && styles.modeBtnTextActive]}>
                IP Address
              </Text>
            </Pressable>
          </View>

          {mode === 'username' ? (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="your-username"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ) : (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Host</Text>
                <TextInput
                  style={styles.input}
                  value={host}
                  onChangeText={setHost}
                  placeholder="192.168.1.100"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Port</Text>
                <TextInput
                  style={styles.input}
                  value={port}
                  onChangeText={setPort}
                  placeholder="9876"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="number-pad"
                />
              </View>
            </>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Token</Text>
            <TextInput
              style={styles.input}
              value={token}
              onChangeText={setToken}
              placeholder="Your auth token"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.connectBtn, connecting && styles.connectBtnDisabled]}
            onPress={handleConnect}
            disabled={connecting}
          >
            {connecting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.connectBtnText}>Connect</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: spacing.xxxl,
  },
  logo: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
  },
  subtitle: {
    color: colors.textTertiary,
    fontSize: fontSize.md,
    marginTop: spacing.sm,
  },
  section: {
    marginBottom: spacing.xxl,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  machineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgTertiary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  machineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: spacing.md,
  },
  machineInfo: {
    flex: 1,
  },
  machineName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  machineHost: {
    color: colors.textTertiary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.bgTertiary,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: spacing.lg,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  modeBtnActive: {
    backgroundColor: colors.bgElevated,
  },
  modeBtnText: {
    color: colors.textTertiary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  modeBtnTextActive: {
    color: colors.text,
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
    fontWeight: '500',
  },
  input: {
    backgroundColor: colors.bgTertiary,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    fontSize: fontSize.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    height: 48,
  },
  error: {
    color: colors.error,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  connectBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  connectBtnDisabled: {
    opacity: 0.6,
  },
  connectBtnText: {
    color: '#fff',
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
})
