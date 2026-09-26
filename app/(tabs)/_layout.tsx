import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ColorValue } from 'react-native';
import { useTheme } from '../../lib/theme';
import { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

function iconFor(name: IoniconName, outline: IoniconName, focused: boolean) {
  return (props: { color: ColorValue; size: number }) => (
    <Ionicons name={focused ? name : outline} size={props.size} color={props.color} />
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();

  const screenOptions = {
    headerShown: false,
    tabBarActiveTintColor: colors.accent,
    tabBarInactiveTintColor: colors.muted,
    tabBarStyle: {
      backgroundColor: colors.background,
      borderTopColor: colors.border,
      borderTopWidth: 0.5,
      elevation: 0,
      shadowOpacity: 0,
    },
    tabBarLabelStyle: {
      fontSize: 10,
      fontWeight: '600' as const,
      letterSpacing: 0.3,
    },
    tabBarItemStyle: {
      paddingVertical: 4,
    },
  };

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) =>
            iconFor('home', 'home-outline', focused)({ color, size }),
        }}
      />

      <Tabs.Screen
        name="market"
        options={{
          title: 'Markets',
          tabBarIcon: ({ color, size, focused }) =>
            iconFor('bar-chart', 'bar-chart-outline', focused)({ color, size }),
        }}
      />

      <Tabs.Screen
        name="generate"
        options={{
          title: 'Signals',
          tabBarIcon: ({ color, size, focused }) =>
            iconFor('flash', 'flash-outline', focused)({ color, size }),
        }}
      />

      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size, focused }) =>
            iconFor('time', 'time-outline', focused)({ color, size }),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) =>
            iconFor('person', 'person-outline', focused)({ color, size }),
        }}
      />
    </Tabs>
  );
}