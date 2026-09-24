import { useLayoutEffect, useRef } from 'react';
import type { BoardElement } from '../../../domain/board';
import type { View } from '../../../domain/view';
import { toScreen } from '../../../domain/view';

interface TextEditorOverlayProps {
	element: BoardElement;
	view: View;
	onCommit: (text: string, width: number, height: number) => void;
	onCancel: () => void;
}

function measure(text: string, fontSize: number): { width: number; height: number } {
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	const lines = (text || ' ').split('\n');
	let width = 40;
	if (ctx) {
		ctx.font = `${fontSize}px Inter, sans-serif`;
		for (const line of lines) width = Math.max(width, ctx.measureText(line || ' ').width);
	}
	return { width: width + 8, height: lines.length * fontSize * 1.3 };
}

/** HTML-textarea поверх канвасу для редагування тексту — Konva не вміє нативний text input. */
export default function TextEditorOverlay({ element, view, onCommit, onCancel }: TextEditorOverlayProps) {
	const ref = useRef<HTMLTextAreaElement | null>(null);

	const screen = toScreen(element.x, element.y, view);
	const fontSize = (element.fontSize ?? 20) * view.scale;

	// Той самий вимір (canvas `measureText`, по НАЙДОВШОМУ рядку між `\n`), що й `commit()` нижче —
	// інакше textarea під час набору показує зовсім іншу картину, ніж те, що збережеться: попередня
	// версія стискала textarea до 1px і читала `scrollWidth` звідти, тож рядок без явних `\n` (просто
	// довгий безперервний текст) переносився на багато коротких рядків у самій textarea, хоча в
	// `element.text` це один рядок — після збереження Konva малює його одним рядком, і виглядає так,
	// ніби текст "стрибнув" в інший вигляд.
	const applySize = (el: HTMLTextAreaElement) => {
		const { width, height } = measure(el.value, fontSize);
		el.style.width = `${width}px`;
		el.style.height = `${height}px`;
	};

	// useLayoutEffect (не useEffect) — розмір застосовується ДО першого пофарбованого кадру, інакше
	// при редагуванні вже довгого тексту на мить блимне стандартна ширина textarea (~20 символів).
	useLayoutEffect(() => {
		ref.current?.focus();
		ref.current?.select();
		if (ref.current) applySize(ref.current);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const commit = () => {
		const value = ref.current?.value ?? '';
		if (!value.trim()) {
			onCancel();
			return;
		}
		const { width, height } = measure(value, element.fontSize ?? 20);
		onCommit(value, width, height);
	};

	return (
		<textarea
			ref={ref}
			defaultValue={element.text ?? ''}
			className="absolute resize-none overflow-hidden border-none bg-transparent p-0 leading-[1.3] outline-none"
			style={{
				left: screen.x,
				top: screen.y,
				fontSize,
				color: element.stroke,
				fontFamily: 'Inter, sans-serif',
				minWidth: 40,
				minHeight: fontSize * 1.3,
			}}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === 'Escape') {
					e.preventDefault();
					onCancel();
				}
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					commit();
				}
			}}
			onInput={(e) => applySize(e.currentTarget)}
		/>
	);
}
