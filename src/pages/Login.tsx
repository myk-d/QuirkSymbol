import { PenTool } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../components/UI/Button';
import { UrlConfig } from '../constants/urls';
import { useAuthStore } from '../store/useAuthStore';

export default function Login() {
	const { loginWithGoogle, isLoggingIn } = useAuthStore();

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

			<Button size="lg" onClick={loginWithGoogle} isLoading={isLoggingIn} className="w-full max-w-xs">
				Увійти через Google
			</Button>

			<Link to={UrlConfig.home} className="text-sm text-muted underline hover:text-page-text">
				Продовжити без входу
			</Link>
		</div>
	);
}
