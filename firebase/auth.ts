// firebase/auth.ts

import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from "firebase/auth";
import { doc, setDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { auth, db } from "./firebase";

// 新規ユーザー登録＋Firestore保存（ロール管理付き）
export const signUpUser = async (email: string, password: string, name: string) => {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  // 既存ユーザーがいなければ最初の人をadminに
  let role = "employee";
  try {
    const usersSnapshot = await getDocs(collection(db, "users"));
    if (usersSnapshot.empty) role = "admin";
  } catch (e) {
    // ユーザー一覧取得に失敗してもemployeeとして登録を続行
    if (import.meta.env.DEV) console.warn('ユーザー一覧チェックに失敗（employeeで登録）:', e);
  }
  await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    name,
    email,
    role,
    createdAt: new Date(),
  });
  return user;
};

export const signInUser = async (email: string, password: string) => {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
};

export const signOutUser = async () => signOut(auth);

export const resetPassword = async (email: string) => {
  await sendPasswordResetEmail(auth, email);
};

// 全ユーザー取得（admin 用）
export const getAllUsers = async () => {
  const snapshot = await getDocs(collection(db, 'users'));
  const users = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
  // createdAt がないドキュメントも含めてソート（ない場合は末尾）
  users.sort((a: any, b: any) => {
    const aTime = a.createdAt?.toDate?.()?.getTime?.() ?? a.createdAt?.getTime?.() ?? 0;
    const bTime = b.createdAt?.toDate?.()?.getTime?.() ?? b.createdAt?.getTime?.() ?? 0;
    return aTime - bTime;
  });
  return users;
};

// ユーザーのロールを更新（admin 用）
export const updateUserRole = async (uid: string, role: 'admin' | 'supervisor' | 'employee') => {
  await updateDoc(doc(db, 'users', uid), { role });
};

// ユーザーの上長（supervisorId）を更新（admin 用）
export const updateUserSupervisor = async (uid: string, supervisorId: string) => {
  await updateDoc(doc(db, 'users', uid), { supervisorId });
};
