import { useConnectionStatus } from '@/lib/store'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'

export default function RootLayout() {
  const _status = useConnectionStatus()

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0a0a0a' },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="connect" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  )
}
