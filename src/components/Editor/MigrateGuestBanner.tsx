import { Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UrlConfig } from '../../constants/urls';
import { migrateGuestBoardToProject } from '../../services/migrateGuestBoard';
import { useAuthStore } from '../../store/useAuthStore';
import { useProjectsStore } from '../../store/useProjectsStore';
import Button from '../UI/Button';
import { toast } from '../UI/toast';

const DISMISS_KEY = 'quirksymbol:migrate-dismissed';

interface MigrateGuestBannerProps {
	hasContent: boolean;
}

/**
 * Пропозиція перенести гостьову (localStorage) дошку в командний проєкт — з'являється, коли людина
 * залогинилась, але лишилась на гостьовій дошці (`/`) і там уже щось намальовано. Гостьову дошку не
 * чіпає — створює НОВИЙ проєкт-копію (`migrateGuestBoardToProject`) і переходить у нього.
 */
export default function MigrateGuestBanner({ hasContent }: MigrateGuestBannerProps) {
	const { user } = useAuthStore();
	const { create } = useProjectsStore();
	const navigate = useNavigate();
	const [dismissed, setDismissed] = useState(() => {
		try {
			return localStorage.getItem(DISMISS_KEY) === '1';
		} catch {
			return false;
		}
	});
	const [busy, setBusy] = useState(false);

	if (!user || !hasContent || dismissed) return null;

	const dismiss = () => {
		try {
			localStorage.setItem(DISMISS_KEY, '1');
		} catch {
			// ignore — гірше, що станеться, це банер знову з'явиться наступного разу
		}
		setDismissed(true);
	};

	const migrate = async () => {
		setBusy(true);
		try {
			const project = await create('Дошка з гостьового режиму', user.uid, user.email || '');
			if (!project) return;
			const count = await migrateGuestBoardToProject(project.id, user.uid);
			toast.success(`Перенесено фігур: ${count}.`);
			dismiss();
			navigate(UrlConfig.editor(project.id));
		} catch (err) {
			console.error(err);
			toast.error('Не вдалося перенести дошку в проєкт.');
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center">
			<div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-panel-border bg-panel px-4 py-2.5 text-sm shadow-lg">
				<Sparkles className="h-4 w-4 shrink-0 text-brand" />
				<span>Зберегти цю дошку як командний проєкт?</span>
				<Button size="sm" onClick={migrate} isLoading={busy}>
					Зберегти як проєкт
				</Button>
				<button onClick={dismiss} title="Не зараз" className="text-muted hover:text-page-text">
					<X className="h-4 w-4" />
				</button>
			</div>
		</div>
	);
}
