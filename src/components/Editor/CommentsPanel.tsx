import { Check, MessageCircle, RotateCcw, Send, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { CommentThread } from '../../domain/comment';
import { useBoardStore } from '../../store/useBoardStore';
import { cn } from '../../utils/cn';

function formatTime(ts: number): string {
	return new Date(ts).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function Thread({ thread, active }: { thread: CommentThread; active: boolean }) {
	const { uid, view, stageSize, setView, setActiveComment, addCommentReply, setCommentResolved, deleteComment } = useBoardStore();
	const [reply, setReply] = useState('');

	const focus = () => {
		setActiveComment(thread.id);
		setView({ offsetX: stageSize.width / 2 - thread.x * view.scale, offsetY: stageSize.height / 2 - thread.y * view.scale });
	};

	const submitReply = () => {
		if (!reply.trim()) return;
		addCommentReply(thread.id, reply);
		setReply('');
	};

	return (
		<div className={cn('rounded-lg border p-2.5 transition-colors', active ? 'border-brand bg-brand-bg' : 'border-panel-border')}>
			<button onClick={focus} className="flex w-full flex-col gap-1.5 text-left">
				{thread.messages.map((m) => (
					<div key={m.id} className="text-sm">
						<div className="flex items-baseline justify-between gap-2">
							<span className="font-medium">{m.authorName}</span>
							<span className="shrink-0 text-[10px] text-muted">{formatTime(m.createdAt)}</span>
						</div>
						<p className="text-page-text/90 break-words">{m.text}</p>
					</div>
				))}
			</button>

			{/* Окремий рядок від resolve/delete нижче — раніше все стояло впритул в один рядок і клік по
			    сусідній кнопці "вирішено" замість Enter тихо закривав тред, а набрана відповідь губилась
			    (не було видимої кнопки відправки). */}
			<div className="mt-2 flex items-center gap-1.5">
				<input
					value={reply}
					onChange={(e) => setReply(e.target.value)}
					onKeyDown={(e) => e.key === 'Enter' && submitReply()}
					placeholder="Відповісти…"
					className="min-w-0 flex-1 rounded-md border border-panel-border bg-page-bg px-2 py-1 text-xs outline-none focus:border-brand"
				/>
				<button
					onClick={submitReply}
					disabled={!reply.trim()}
					title="Надіслати відповідь"
					className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-brand hover:bg-page-bg disabled:opacity-30"
				>
					<Send className="h-3.5 w-3.5" />
				</button>
			</div>
			<div className="mt-1.5 flex items-center justify-end gap-1.5">
				<button
					onClick={() => setCommentResolved(thread.id, !thread.resolved)}
					title={thread.resolved ? 'Відкрити знову' : 'Позначити вирішеним'}
					className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-page-bg"
				>
					{thread.resolved ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
				</button>
				<button
					onClick={() => uid && thread.createdByUid === uid && deleteComment(thread.id)}
					title={thread.createdByUid === uid ? 'Видалити тред' : 'Видалити може лише автор'}
					disabled={thread.createdByUid !== uid}
					className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-danger hover:bg-page-bg disabled:opacity-30"
				>
					<Trash2 className="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	);
}

/** Правий висувний сайдбар коментарів (Фаза 2) — CSS-only анімація, за зразком PropertiesPanel. */
export default function CommentsPanel() {
	const { comments, commentsOpen, activeCommentId, setCommentsOpen } = useBoardStore();
	const [showResolved, setShowResolved] = useState(false);

	const all = Object.values(comments).sort((a, b) => b.createdAt - a.createdAt);
	const open = all.filter((c) => !c.resolved);
	const resolved = all.filter((c) => c.resolved);

	return (
		<div
			className={cn(
				'z-10 shrink-0 overflow-hidden border-panel-border bg-panel transition-all duration-200 ease-out',
				commentsOpen ? 'w-72 border-l opacity-100' : 'pointer-events-none w-0 border-l-0 opacity-0',
			)}
		>
			<div className="flex h-full w-72 flex-col text-sm">
				<div className="flex h-12 shrink-0 items-center justify-between border-b border-panel-border px-3">
					<div className="flex items-center gap-1.5 font-semibold">
						<MessageCircle className="h-4 w-4 text-brand" /> Коментарі
					</div>
					<button onClick={() => setCommentsOpen(false)} className="text-muted hover:text-page-text">
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2.5">
					{all.length === 0 && (
						<p className="mt-4 px-1 text-center text-xs text-muted">
							Немає коментарів. Обери інструмент «Коментар» на панелі й клікни по канвасу.
						</p>
					)}
					{open.map((t) => (
						<Thread key={t.id} thread={t} active={t.id === activeCommentId} />
					))}
					{resolved.length > 0 && (
						<div className="mt-1">
							<button onClick={() => setShowResolved(!showResolved)} className="px-1 text-xs text-muted hover:text-page-text">
								{showResolved ? 'Сховати' : 'Показати'} вирішені ({resolved.length})
							</button>
							{showResolved && (
								<div className="mt-2 flex flex-col gap-2">
									{resolved.map((t) => (
										<Thread key={t.id} thread={t} active={t.id === activeCommentId} />
									))}
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
