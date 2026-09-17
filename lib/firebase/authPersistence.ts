import { initializeAuth, getReactNativePersistence } from '@firebase/auth'
import type { FirebaseApp } from 'firebase/app'
import AsyncStorage from '@react-native-async-storage/async-storage'

export function createAuthPersistence(app: FirebaseApp) {
  return initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  })
}