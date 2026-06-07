
import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { signInUser, signOutUser, signUpUser } from '../firebase/auth';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth, db } from '../firebase/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

type UserWithRole = FirebaseUser & { role?: string; name?: string; supervisorId?: string };

type AuthContextType = {
  user: UserWithRole | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserWithRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Firestoreからroleも取得
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        let userDoc = await getDoc(userDocRef);
        // Firestoreにドキュメントがない場合は自動作成（Auth のみ存在するユーザーの救済）
        if (!userDoc.exists()) {
          await setDoc(userDocRef, {
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || '',
            email: firebaseUser.email || '',
            role: 'employee',
            createdAt: new Date(),
          });
          userDoc = await getDoc(userDocRef);
        }
        const userData = userDoc.exists() ? userDoc.data() : {};
        setUser({ ...firebaseUser, ...userData });
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await signInUser(email, password);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    await signOutUser();
    setUser(null);
  };

  const signup = async (email: string, password: string, name: string) => {
    setIsLoading(true);
    try {
      const firebaseUser = await signUpUser(email, password, name);
      // signUpUser 完了後、Firestore ドキュメントが確実に存在するので再取得してstateを更新
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};
      setUser({ ...firebaseUser, ...userData });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, signup }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
