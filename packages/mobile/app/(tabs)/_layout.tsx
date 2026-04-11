import { useConnectionStatus } from '@/lib/store'
import { colors, fontSize } from '@/theme/colors'
import { Tabs } from 'expo-router'
import { Redirect } from 'expo-router'
import { FolderOpen, MessageSquare, Settings } from 'lucide-react-native'
import { StyleSheet } from 'react-native'

export default function TabLayout() {
  const status = useConnectionStatus()

  if (status !== 'connected') {
    return <Redirect href="/connect" />
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: {
          fontSize: fontSize.xs,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => (
            <MessageSquare size={size} strokeWidth={1.5} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: 'Projects',
          tabBarIcon: ({ color, size }) => (
            <FolderOpen size={size} strokeWidth={1.5} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size} strokeWidth={1.5} color={color} />,
        }}
      />
    </Tabs>
  )
}
