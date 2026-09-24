import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { create } from 'zustand';
import { firebaseAuth, firebaseProvider } from '../config/firebase.config';
import { dbUsers, type UserData } from '../services/users.service';
import { toast } from '../components/UI/toast';

interface AuthState {
	user: User | null;
	dbUser: UserData | null;
	isInitializing: boolean;
	isLoggingIn: boolean;
	loginWithGoogle: () => Promise<void>;
	logout: () => Promise<void>;
	initializeAuthListener: () => () => void;
}

function authErrorMessage(code: string | undefined, fallback: string): string {
	switch (code) {
		case 'auth/too-many-requests':
			return 'Забагато спроб — спробуйте пізніше.';
		case 'auth/popup-closed-by-user':
		case 'auth/cancelled-popup-request':
			return '';
		default:
			return code ? `${fallback} (${code})` : fallback;
	}
}

/** Google завжди повертає підтверджену пошту, тож `email_verified` у Firestore rules (`signedIn()`) завжди true тут. */
async function ensureUserProfile(user: User): Promise<UserData | null> {
	let dbUser = await dbUsers.getById(user.uid);
	if (!dbUser) {
		dbUser = await dbUsers.set(user.uid, {
			displayName: user.displayName || 'Користувач',
			email: user.email || '',
			photoURL: user.photoURL || '',
			createdAt: Date.now(),
		});
	}
	return dbUser;
}

export const useAuthStore = create<AuthState>((set) => ({
	user: null,
	dbUser: null,
	isInitializing: true,
	isLoggingIn: false,

	loginWithGoogle: async () => {
		try {
			set({ isLoggingIn: true });
			await signInWithPopup(firebaseAuth, firebaseProvider);
		} catch (error) {
			const code = (error as { code?: string })?.code;
			const message = authErrorMessage(code, 'Не вдалося увійти через Google.');
			if (message) toast.error(message);
		} finally {
			set({ isLoggingIn: false });
		}
	},

	logout: async () => {
		try {
			await signOut(firebaseAuth);
			set({ user: null, dbUser: null });
		} catch (error) {
			console.error('Помилка виходу:', error);
		}
	},

	initializeAuthListener: () => {
		const unsubscribe = onAuthStateChanged(firebaseAuth, async (currentUser) => {
			if (!currentUser) {
				set({ user: null, dbUser: null, isInitializing: false });
				return;
			}

			try {
				const dbUser = await ensureUserProfile(currentUser);
				set({ user: currentUser, dbUser, isInitializing: false });
			} catch (error) {
				console.error('Не вдалося завантажити/створити профіль:', error);
				toast.error('Не вдалося завершити вхід. Спробуйте оновити сторінку.');
				set({ user: currentUser, dbUser: null, isInitializing: false });
			}
		});

		return unsubscribe;
	},
}));
