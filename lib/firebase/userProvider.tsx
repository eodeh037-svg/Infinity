import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { PremiumEntitlement, expiresToDate } from '../server/premium';
import { UserProfile } from '../../types';

const EMPTY_PREMIUM: PremiumEntitlement = {
  active: false,
  plan: null,
  activatedAt: null,
  expiresAt: null,
  paymentId: null,
};

function deriveEntitlement(data: Record<string, any>): PremiumEntitlement {
  const premium = (data.premium ?? {}) as Record<string, any>;

  return {
    active: premium.active === true,
    plan: (premium.plan as PremiumEntitlement['plan']) || null,
    activatedAt: premium.activatedAt ?? null,
    expiresAt: premium.expiresAt ?? null,
    paymentId: premium.paymentId ?? null,
  };
}

type UserContextValue = {
  firebaseUser: FirebaseUser | null;
  user: UserProfile | null;
  premium: PremiumEntitlement;
  isPremium: boolean;
  loading: boolean;
};

const UserContext = createContext<UserContextValue | null>(null);


export function UserProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [premium, setPremium] = useState<PremiumEntitlement>(EMPTY_PREMIUM);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setFirebaseUser(currentUser);

      if (!currentUser) {
        setUser(null);
        setPremium(EMPTY_PREMIUM);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const uid = firebaseUser?.uid ?? null;

  useEffect(() => {
    if (!uid) return;

    const userRef = doc(db, 'users', uid);

    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setUser(null);
          setPremium(EMPTY_PREMIUM);
        } else {
          const data = snapshot.data() as Record<string, any>;
          setUser(data as unknown as UserProfile);
          setPremium(deriveEntitlement(data));
        }
        setLoading(false);
      },
      (error) => {
        console.error('User profile subscription error:', error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [uid]);

  const entitlementActive =
    premium.active &&
    (premium.expiresAt
      ? expiresToDate(premium.expiresAt).getTime() > Date.now()
      : true);

  const isPremium = entitlementActive || user?.plan === 'premium';

  return (
    <UserContext.Provider
      value={{ firebaseUser, user, premium, isPremium, loading }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const context = useContext(UserContext);

  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }

  return context;
}