import { Eye, EyeOff, Lock, Mail, PenTool, User } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/UI/Button';
import { UrlConfig } from '../constants/urls';
import { useAuthStore } from '../store/useAuthStore';
import { cn } from '../utils/cn';

type Mode = 'signin' | 'signup' | 'reset';

const inputClass = 'w-full rounded-md border border-panel-border bg-page-bg py-2 pr-3 pl-9 text-sm outline-none focus:border-brand';

export default function Login() {
	const { loginWithGoogle, loginWithEmail, signUpWithEmail, resetPassword, isLoggingIn } = useAuthStore();
	const [mode, setMode] = useState<Mode>('signin');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [displayName, setDisplayName] = useState('');
	const [showPassword, setShowPassword] = useState(false);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (mode === 'signin') await loginWithEmail(email, password);
		else if (mode === 'signup') await signUpWithEmail(email, password, displayName);
		else await resetPassword(email);
	};

	return (
		<div className="flex h-full flex-col items-center justify-center gap-6 bg-page-bg px-4 py-8 text-center">
			<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white">
				<PenTool className="h-7 w-7" />
			</div>
			<div>
				<h1 className="text-2xl font-semibold">QuirkSymbol</h1>
				<p className="mt-1 max-w-sm text-sm text-muted">
					Вхід потрібен лише для командних проєктів — керування учасниками й синхронізація в реальному часі.
				</p>
			</div>

			<Button size="lg" variant="outline" onClick={loginWithGoogle} isLoading={isLoggingIn} className="w-full max-w-xs">
				Увійти через Google
			</Button>

			<form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-2.5 text-left">
				{mode === 'signup' && (
					<div className="relative">
						<User className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
						<input
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
							placeholder="Ім'я"
							required
							className={inputClass}
						/>
					</div>
				)}
				<div className="relative">
					<Mail className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
					<input
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder="email@company.com"
						required
						className={inputClass}
					/>
				</div>
				{mode !== 'reset' && (
					<div className="relative">
						<Lock className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
						<input
							type={showPassword ? 'text' : 'password'}
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="Пароль"
							required
							minLength={6}
							className={cn(inputClass, 'pr-9')}
						/>
						<button
							type="button"
							onClick={() => setShowPassword((v) => !v)}
							className="absolute top-1/2 right-3 -translate-y-1/2 text-muted hover:text-page-text"
							tabIndex={-1}
						>
							{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
						</button>
					</div>
				)}

				<Button type="submit" isLoading={isLoggingIn}>
					{mode === 'signin' ? 'Увійти' : mode === 'signup' ? 'Зареєструватись' : 'Надіслати посилання'}
				</Button>

				<div className="flex justify-between text-xs text-muted">
					{mode === 'signin' && (
						<>
							<button type="button" onClick={() => setMode('signup')} className="underline hover:text-page-text">
								Немає акаунту? Реєстрація
							</button>
							<button type="button" onClick={() => setMode('reset')} className="underline hover:text-page-text">
								Забули пароль?
							</button>
						</>
					)}
					{mode === 'signup' && (
						<button type="button" onClick={() => setMode('signin')} className="underline hover:text-page-text">
							Вже є акаунт? Увійти
						</button>
					)}
					{mode === 'reset' && (
						<button type="button" onClick={() => setMode('signin')} className="underline hover:text-page-text">
							Назад до входу
						</button>
					)}
				</div>
			</form>

			<Link to={UrlConfig.home} className="text-sm text-muted underline hover:text-page-text">
				Продовжити без входу
			</Link>
		</div>
	);
}
