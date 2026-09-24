import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useRef, useState } from 'react';
import { Group, Layer, Line, Rect, Stage, Transformer } from 'react-konva';
import { groupMembers, visibleElements, type BoardElement } from '../../../domain/board';
import { LASER_FADE_MS } from '../../../domain/comment';
import { elementBounds, normalizeRect, rectContains, rectsIntersect, snapMove, type Rect as GeomRect } from '../../../domain/geometry';
import { snapPoint } from '../../../domain/snapping';
import { toScreen } from '../../../domain/view';
import { useBoardStore } from '../../../store/useBoardStore';
import { downloadDataUrl } from '../../../utils/downloadFile';
import { useElementSize } from '../../../utils/useElementSize';
import CommentComposer from '../render/CommentComposer';
import CommentPins from '../render/CommentPins';
import ElementShape from '../render/ElementShape';
import EmbedOverlays from '../render/EmbedOverlays';
import FrameLabelEditor from '../render/FrameLabelEditor';
import GridDots from '../render/GridDots';
import LaserTrails, { type LaserPoint } from '../render/LaserTrails';
import PresenceCursors from '../render/PresenceCursors';
import TextEditorOverlay from '../render/TextEditorOverlay';
import { canvasTheme } from '../render/theme';
import { useImageInsert } from '../useImageInsert';

const TRANSFORMABLE = new Set(['rectangle', 'ellipse', 'diamond', 'frame', 'image', 'embed', 'text', 'line', 'arrow', 'draw']);
/** Обгортка над `Date.now()` для лазерного сліду — виклик поза тілом компонента, щоб react-hooks/purity
 *  не сприймав його як нечисту функцію всередині рендеру (хендлери й так виконуються не під час рендеру,
 *  але лінтер аналізує лексичний скоуп). */
function now(): number {
	return Date.now();
}
const MIN_DRAW_SIZE = 4;
/** Магнітна відстань до країв/центрів інших фігур під час перетягування — у ЕКРАННИХ пікселях (не world). */
const SNAP_THRESHOLD_PX = 8;

export default function BoardCanvas() {
	const { ref, width, height } = useElementSize<HTMLDivElement>();
	const stageRef = useRef<Konva.Stage | null>(null);
	const trRef = useRef<Konva.Transformer | null>(null);

	const {
		elements,
		selected,
		tool,
		view,
		snapEnabled,
		uid,
		comments,
		presence,
		activeCommentId,
		setView,
		setStageSize,
		zoomAt,
		select,
		toggleSelect,
		clearSelection,
		startElement,
		updateElementLive,
		finishElement,
		cancelElement,
		beginDrag,
		dragBy,
		endDrag,
		deleteSelected,
		registerStageExport,
		addComment,
		setActiveComment,
		setCommentsOpen,
		updateCursor,
		stopLaser,
		renameFrame,
	} = useBoardStore();

	const [drawingId, setDrawingId] = useState<string | null>(null);
	const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
	const [marquee, setMarquee] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
	const [editingTextId, setEditingTextId] = useState<string | null>(null);
	const [renamingFrameId, setRenamingFrameId] = useState<string | null>(null);
	const [activeEmbedId, setActiveEmbedId] = useState<string | null>(null);
	const [composerAt, setComposerAt] = useState<{ x: number; y: number } | null>(null);
	const panRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
	const dragLastWorld = useRef<{ x: number; y: number } | null>(null);
	const dragStartWorld = useRef<{ x: number; y: number } | null>(null);
	const dragOriginalBoxes = useRef<GeomRect[]>([]);
	const dragIds = useRef<Set<string>>(new Set());
	const dragAppliedOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
	const [snapGuides, setSnapGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
	const erasingRef = useRef(false);
	const [spacePressed, setSpacePressed] = useState(false);
	const [isPanning, setIsPanning] = useState(false);
	const laserDrawingRef = useRef(false);
	const [ownLaserPoints, setOwnLaserPoints] = useState<LaserPoint[]>([]);

	useEffect(() => {
		setStageSize({ width, height });
	}, [width, height, setStageSize]);

	// Escape виходить з "активованої" вбудови (Tool.embed, live iframe) так само, як скидає виділення
	// деінде — окремий локальний слухач, бо `useBoardShortcuts` не знає про цей локальний стан BoardCanvas.
	useEffect(() => {
		if (!activeEmbedId) return;
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setActiveEmbedId(null);
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [activeEmbedId]);

	// Реєструємо один раз — читає свіжий стан через getState(), тож не залежить від замикання React.
	useEffect(() => {
		registerStageExport(() => {
			const stage = stageRef.current;
			if (!stage) return;
			const state = useBoardStore.getState();
			const visible = visibleElements(state.elements);

			// Ховаємо ручки Transformer'а на час знімку, щоб не потрапили в експорт.
			const prevNodes = trRef.current?.nodes() ?? [];
			trRef.current?.nodes([]);
			stage.batchDraw();

			let uri: string;
			if (visible.length === 0) {
				uri = stage.toDataURL({ pixelRatio: 2 });
			} else {
				let minX = Infinity;
				let minY = Infinity;
				let maxX = -Infinity;
				let maxY = -Infinity;
				for (const el of visible) {
					const b = elementBounds(el);
					minX = Math.min(minX, b.x);
					minY = Math.min(minY, b.y);
					maxX = Math.max(maxX, b.x + b.width);
					maxY = Math.max(maxY, b.y + b.height);
				}
				const pad = 24;
				const v = state.view;
				uri = stage.toDataURL({
					x: (minX - pad) * v.scale + v.offsetX,
					y: (minY - pad) * v.scale + v.offsetY,
					width: (maxX - minX + pad * 2) * v.scale,
					height: (maxY - minY + pad * 2) * v.scale,
					pixelRatio: 2,
				});
			}

			trRef.current?.nodes(prevNodes);
			stage.batchDraw();
			downloadDataUrl(uri, 'quirksymbol.png');
		});
		return () => registerStageExport(null);
	}, [registerStageExport]);

	// Реактивний стан (не ref) — курсор має відразу показати "рука" на Space, а не чекати наступного
	// ре-рендеру з іншої причини.
	useEffect(() => {
		const down = (e: KeyboardEvent) => e.code === 'Space' && setSpacePressed(true);
		const up = (e: KeyboardEvent) => e.code === 'Space' && setSpacePressed(false);
		window.addEventListener('keydown', down);
		window.addEventListener('keyup', up);
		return () => {
			window.removeEventListener('keydown', down);
			window.removeEventListener('keyup', up);
		};
	}, []);

	// Ctrl+V із зображенням у буфері — вставляє по центру вʼюпорту (та сама логіка, що й кнопка
	// "Зображення" на тулбарі). Якщо в буфері текст (не картинка), `item` не знайдеться й paste
	// пройде звичайним шляхом (наприклад, у підпис кадру чи текстовий оверлей).
	const insertImageFromFile = useImageInsert();
	useEffect(() => {
		const onPaste = (e: ClipboardEvent) => {
			const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
			const file = item?.getAsFile();
			if (!file) return;
			e.preventDefault();
			insertImageFromFile(file);
		};
		window.addEventListener('paste', onPaste);
		return () => window.removeEventListener('paste', onPaste);
	}, [insertImageFromFile]);

	const els = visibleElements(elements);

	useEffect(() => {
		const tr = trRef.current;
		const stage = stageRef.current;
		if (!tr || !stage) return;
		let raf = 0;
		let cancelled = false;
		// Щойно вставлене зображення ще не має Konva-вузла в перший момент — `useLoadedImage`
		// вантажить `HTMLImageElement` асинхронно, і `ElementShape` рендерить null, поки не готово.
		// Тож якщо `findOne` не знайшов вузол одразу, пробуємо ще кілька кадрів, а не здаємось миттєво.
		// Працює і для одного, і для кількох виділених елементів одразу — Konva.Transformer нативно
		// вміє показувати спільну рамку навколо кількох вузлів і масштабувати кожен пропорційно.
		const attempt = (triesLeft: number) => {
			if (cancelled) return;
			if (tool === 'select' && selected.length > 0 && selected.every((id) => elements[id] && TRANSFORMABLE.has(elements[id].type))) {
				const nodes = selected.map((id) => stage.findOne(`#${id}`)).filter((n): n is Konva.Node => !!n);
				if (nodes.length === selected.length) {
					tr.nodes(nodes);
					tr.getLayer()?.batchDraw();
					return;
				}
				if (triesLeft > 0) {
					raf = requestAnimationFrame(() => attempt(triesLeft - 1));
					return;
				}
			}
			tr.nodes([]);
		};
		attempt(15);
		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
		};
	}, [selected, tool, elements]);

	const pointerWorld = (): { x: number; y: number } | null => {
		const pos = stageRef.current?.getPointerPosition();
		if (!pos) return null;
		return { x: (pos.x - view.offsetX) / view.scale, y: (pos.y - view.offsetY) / view.scale };
	};

	const onWheel = (e: KonvaEventObject<WheelEvent>) => {
		e.evt.preventDefault();
		const pos = stageRef.current?.getPointerPosition();
		if (pos) zoomAt(pos.x, pos.y, e.evt.deltaY < 0 ? 1.08 : 1 / 1.08);
	};

	const eraseAtPointer = () => {
		const stage = stageRef.current;
		if (!stage) return;
		const pos = stage.getPointerPosition();
		if (!pos) return;
		const shape = stage.getIntersection(pos);
		const id = shape?.id();
		if (id && elements[id] && !elements[id].deleted) {
			select([id]);
			deleteSelected();
		}
	};

	/** Елементи (крім самого кадру), чий bounding box повністю лежить всередині кадру `frame` — рухаються разом з ним. */
	const frameChildren = (frame: BoardElement): string[] => {
		const fb = elementBounds(frame);
		return els.filter((e) => e.id !== frame.id && e.type !== 'frame' && rectContains(fb, elementBounds(e))).map((e) => e.id);
	};

	const onMouseDown = (e: KonvaEventObject<MouseEvent>) => {
		if (editingTextId || composerAt || renamingFrameId) return;
		// Canvas не є фокусованим елементом — без цього браузер вважає mousedown кліком "мимо" і
		// забирає фокус з щойно змонтованого <textarea> (text tool) ще до mouseup того самого кліку.
		e.evt.preventDefault();
		// Цей обробник взагалі спрацьовує, лише коли клік влучив ПОЗА активним iframe вбудови (сам
		// iframe, поки активний, перехоплює клік ще до Konva) — тож дійшовши сюди, безпечно вийти з
		// режиму "активної" вбудови незалежно від того, що далі клацнули.
		if (activeEmbedId) setActiveEmbedId(null);
		if (tool === 'pan' || spacePressed || e.evt.button === 1) {
			const p = stageRef.current!.getPointerPosition()!;
			panRef.current = { x: p.x, y: p.y, ox: view.offsetX, oy: view.offsetY };
			setIsPanning(true);
			return;
		}
		if (e.evt.button === 2) return;
		const world = pointerWorld();
		if (!world) return;
		const clickedEmpty = e.target === e.target.getStage();

		if (tool === 'eraser') {
			erasingRef.current = true;
			eraseAtPointer();
			return;
		}

		if (tool === 'laser') {
			laserDrawingRef.current = true;
			setOwnLaserPoints([{ x: world.x, y: world.y, t: now() }]);
			updateCursor(world.x, world.y, true);
			return;
		}

		if (tool === 'comment') {
			if (!clickedEmpty) return;
			setComposerAt(world);
			return;
		}

		if (tool === 'select') {
			if (clickedEmpty) {
				if (!e.evt.shiftKey) clearSelection();
				setMarquee({ a: world, b: world });
				return;
			}
			const id = e.target.id();
			if (!id || !elements[id]) return;
			const groupIds = groupMembers(elements, id);
			if (e.evt.shiftKey) {
				if (groupIds.length > 1) {
					const allSelected = groupIds.every((gid) => selected.includes(gid));
					select(allSelected ? selected.filter((s) => !groupIds.includes(s)) : [...new Set([...selected, ...groupIds])]);
				} else {
					toggleSelect(id);
				}
				return;
			}
			// Клік по фігурі, що входить у групу, виділяє всю групу (як в Excalidraw) — якщо тільки
			// вона вже не є частиною поточного (можливо, ширшого) marquee-виділення.
			const groupAlreadySelected = groupIds.every((gid) => selected.includes(gid));
			const nextSelected = groupAlreadySelected ? selected : groupIds;
			if (!groupAlreadySelected) select(groupIds);
			// Кадр тягне за собою фігури, що геометрично лежать у ньому повністю — без персистентного
			// зв'язку (без окремого `frameId` на дітях): перелік рахуємо один раз, на старті цього drag.
			const extraIds = nextSelected.flatMap((sid) => {
				const selEl = elements[sid];
				return selEl?.type === 'frame' ? frameChildren(selEl) : [];
			});
			beginDrag(nextSelected, extraIds);
			dragIds.current = new Set([...nextSelected, ...extraIds]);
			dragOriginalBoxes.current = [...nextSelected, ...extraIds].map((sid) => elements[sid]).filter(Boolean).map(elementBounds);
			dragAppliedOffset.current = { dx: 0, dy: 0 };
			setSnapGuides({ x: null, y: null });
			dragStartWorld.current = world;
			dragLastWorld.current = world;
			return;
		}

		if (tool === 'text') {
			const id = startElement('text', world.x, world.y);
			updateElementLive(id, { width: 40, height: 26 });
			setEditingTextId(id);
			return;
		}

		// Малювання олівцем НІКОЛИ не прив'язується до сітки — прив'язка кожної точки довільного мазка
		// перетворює плавний рух руки на "сходинки" вздовж ліній сітки (виглядає як збій рендеру).
		// Для прямокутника/лінії/стрілки прив'язка одної точки — очікувана й корисна поведінка.
		const sp = tool === 'draw' ? world : snapPoint(world.x, world.y, snapEnabled);
		const id = startElement(tool, sp.x, sp.y);
		setDrawingId(id);
		setDrawStart(sp);
	};

	const onMouseMove = () => {
		const pos = stageRef.current?.getPointerPosition();
		if (!pos) return;

		if (panRef.current) {
			setView({ offsetX: panRef.current.ox + (pos.x - panRef.current.x), offsetY: panRef.current.oy + (pos.y - panRef.current.y) });
			return;
		}

		if (erasingRef.current) {
			eraseAtPointer();
			return;
		}

		const world = { x: (pos.x - view.offsetX) / view.scale, y: (pos.y - view.offsetY) / view.scale };

		if (laserDrawingRef.current) {
			const t = now();
			setOwnLaserPoints((pts) => [...pts, { x: world.x, y: world.y, t }].filter((p) => t - p.t < LASER_FADE_MS));
			updateCursor(world.x, world.y, true);
			return;
		}

		updateCursor(world.x, world.y);

		if (dragLastWorld.current && dragStartWorld.current) {
			const rawDx = world.x - dragStartWorld.current.x;
			const rawDy = world.y - dragStartWorld.current.y;
			const others = snapEnabled ? els.filter((el) => !dragIds.current.has(el.id)).map(elementBounds) : [];
			const result =
				others.length > 0
					? snapMove(dragOriginalBoxes.current, rawDx, rawDy, others, SNAP_THRESHOLD_PX / view.scale)
					: { dx: rawDx, dy: rawDy, guideX: null, guideY: null };
			const deltaDx = result.dx - dragAppliedOffset.current.dx;
			const deltaDy = result.dy - dragAppliedOffset.current.dy;
			if (deltaDx !== 0 || deltaDy !== 0) dragBy(deltaDx, deltaDy);
			dragAppliedOffset.current = { dx: result.dx, dy: result.dy };
			setSnapGuides({ x: result.guideX, y: result.guideY });
			return;
		}

		if (drawingId && drawStart) {
			const isDraw = elements[drawingId]?.type === 'draw';
			const sp = isDraw ? world : snapPoint(world.x, world.y, snapEnabled);
			if (drawingId && elements[drawingId]?.type && ['line', 'arrow', 'draw'].includes(elements[drawingId].type)) {
				const el = elements[drawingId];
				if (el.type === 'draw') {
					const points = [...(el.points ?? [0, 0]), sp.x - drawStart.x, sp.y - drawStart.y];
					updateElementLive(drawingId, { points, width: Math.abs(sp.x - drawStart.x), height: Math.abs(sp.y - drawStart.y) });
				} else {
					updateElementLive(drawingId, {
						points: [0, 0, sp.x - drawStart.x, sp.y - drawStart.y],
						width: Math.abs(sp.x - drawStart.x),
						height: Math.abs(sp.y - drawStart.y),
					});
				}
			} else {
				const r = normalizeRect(drawStart.x, drawStart.y, sp.x, sp.y);
				updateElementLive(drawingId, r);
			}
			return;
		}

		if (marquee) setMarquee({ a: marquee.a, b: world });
	};

	const onMouseUp = () => {
		panRef.current = null;
		setIsPanning(false);
		erasingRef.current = false;

		if (laserDrawingRef.current) {
			laserDrawingRef.current = false;
			stopLaser();
		}

		if (dragLastWorld.current) {
			dragLastWorld.current = null;
			dragStartWorld.current = null;
			dragOriginalBoxes.current = [];
			dragIds.current = new Set();
			setSnapGuides({ x: null, y: null });
			endDrag();
		}

		if (drawingId) {
			const el = elements[drawingId];
			const tooSmall = el && el.width < MIN_DRAW_SIZE && el.height < MIN_DRAW_SIZE;
			if (tooSmall) cancelElement(drawingId);
			else {
				finishElement(drawingId);
				select([drawingId]);
			}
			setDrawingId(null);
			setDrawStart(null);
		}

		if (marquee) {
			const box = normalizeRect(marquee.a.x, marquee.a.y, marquee.b.x, marquee.b.y);
			if (box.width > 4 || box.height > 4) {
				const hits = els.filter((el) => rectsIntersect(box, elBounds(el)));
				select(hits.map((el) => el.id));
			}
			setMarquee(null);
		}
	};

	/** Який якір Transformer тягнуть зараз — читається на старті жесту (`getActiveAnchor()` після
	 *  завершення вже повертає null), потрібен лише для тексту (кут = кегль, бокова ручка = ширина). */
	const activeAnchorRef = useRef<string | null>(null);

	/** Рахує патч для ОДНОГО елемента після Transformer-жесту — застосовується і при одиночному, і при
	 *  груповому resize/rotate (Konva сам коректно рахує x/y/scale/rotation для КОЖНОГО вузла з кількох,
	 *  тож просто проганяємо кожен через ту саму логіку). */
	const transformPatch = (el: BoardElement, node: Konva.Node): Partial<BoardElement> => {
		const sx = node.scaleX();
		const sy = node.scaleY();
		node.scaleX(1);
		node.scaleY(1);
		const angle = node.rotation();

		if (el.type === 'line' || el.type === 'arrow' || el.type === 'draw') {
			// `points` — координати ВІДНОСНО x,y (не абсолютні), тож саме їх множимо на масштаб, а не
			// перераховуємо як bounding box: інакше форма "стрибне" назад після скидання scale у 1.
			const points = (el.points ?? []).map((p, i) => (i % 2 === 0 ? p * sx : p * sy));
			return { x: node.x(), y: node.y(), points, width: Math.max(4, el.width * sx), height: Math.max(4, el.height * sy), angle };
		}
		if (el.type === 'text') {
			const textNode = node as Konva.Text;
			const isEdgeResize = activeAnchorRef.current === 'middle-left' || activeAnchorRef.current === 'middle-right';
			// Бокова ручка — лише ширина рамки переносу (fontSize не чіпаємо). Кутова — fontSize І
			// ширина в одній пропорції (як фото при масштабуванні за кут): інакше глифи ростуть, а
			// рамка лишається старою, і текст переноситься на нові рядки, хоча користувач хотів просто
			// "більший той самий напис" (саме це й було баг-репортом).
			const fontSize = isEdgeResize ? (el.fontSize ?? 20) : Math.max(6, Math.round((el.fontSize ?? 20) * ((sx + sy) / 2)));
			const width = Math.max(20, isEdgeResize ? el.width * sx : el.width * ((sx + sy) / 2));
			// Висота тексту завжди авто-рахується Konva з перенесених рядків (ми не задаємо `height`
			// пропом) — щоб зберегти актуальне значення в сховищі (для marquee/align/snap, які беруть
			// готовий `el.height`), напряму виставляємо нові fontSize/width на Konva-вузол і читаємо
			// назад його реальну обчислену висоту, а не тримаємо стару застиглу з моменту створення.
			textNode.fontSize(fontSize);
			textNode.width(width);
			const height = textNode.height();
			return { x: node.x(), y: node.y(), fontSize, width, height, angle };
		}
		const w = Math.max(4, el.width * sx);
		const h = Math.max(4, el.height * sy);
		if (el.type === 'ellipse') {
			return { x: node.x() - w / 2, y: node.y() - h / 2, width: w, height: h, angle };
		}
		return { x: node.x(), y: node.y(), width: w, height: h, angle };
	};

	const onTransformStart = () => {
		activeAnchorRef.current = trRef.current?.getActiveAnchor() ?? null;
		if (selected.length > 0) beginDrag(selected);
	};

	const onTransformEnd = () => {
		const nodes = trRef.current?.nodes() ?? [];
		for (const node of nodes) {
			const el = elements[node.id()];
			if (!el) continue;
			updateElementLive(el.id, transformPatch(el, node));
		}
		endDrag();
	};

	const editingElement = editingTextId ? elements[editingTextId] : null;

	return (
		<div ref={ref} className="relative h-full w-full overflow-hidden bg-canvas-bg">
			<Stage
				ref={stageRef}
				width={width}
				height={height}
				onWheel={onWheel}
				onMouseDown={onMouseDown}
				onMouseMove={onMouseMove}
				onMouseUp={onMouseUp}
				onMouseLeave={onMouseUp}
				onContextMenu={(e) => e.evt.preventDefault()}
				style={{
					cursor: isPanning ? 'grabbing' : tool === 'pan' || spacePressed ? 'grab' : tool === 'select' ? 'default' : 'crosshair',
				}}
			>
				<Layer listening={false}>
					<GridDots view={view} width={width} height={height} />
				</Layer>
				<Layer>
					{/* Пан/зум — трансформ застосований лише тут, не на Transformer нижче, тож ручки виділення
					    завжди лишаються сталого розміру на екрані, а не масштабуються разом з фігурами. */}
					<Group x={view.offsetX} y={view.offsetY} scaleX={view.scale} scaleY={view.scale}>
						{els.map((el) => (
							<ElementShape
								key={el.id}
								element={el}
								selected={selected.includes(el.id)}
								onDblClick={
									el.type === 'text'
										? () => setEditingTextId(el.id)
										: el.type === 'frame'
											? () => setRenamingFrameId(el.id)
											: el.type === 'embed'
												? () => setActiveEmbedId(el.id)
												: undefined
								}
							/>
						))}
						{marquee && (
							<Rect
								x={Math.min(marquee.a.x, marquee.b.x)}
								y={Math.min(marquee.a.y, marquee.b.y)}
								width={Math.abs(marquee.b.x - marquee.a.x)}
								height={Math.abs(marquee.b.y - marquee.a.y)}
								fill={canvasTheme.marqueeFill}
								stroke={canvasTheme.marqueeStroke}
								strokeWidth={1}
							/>
						)}
					</Group>
					<Transformer
						ref={trRef}
						onTransformStart={onTransformStart}
						onTransformEnd={onTransformEnd}
						// Кадр і текст не можна обертати: для кадру `elementBounds`/`frameChildren`/snap/align
						// усюди свідомо ігнорують `angle` (задокументовано в geometry.ts як спрощення MVP), тож
						// обертання зламало б підбір "дітей". Для обох — `FrameLabelEditor`/`TextEditorOverlay`,
						// HTML-інпути поверх Konva, не повертаються разом з підписом/текстом при редагуванні.
						// Простіше не дозволяти, ніж узгоджувати все це.
						rotateEnabled={!selected.some((id) => ['frame', 'text'].includes(elements[id]?.type ?? ''))}
						// Текст: кутові ручки масштабують розмір шрифту (пропорційно, як в Excalidraw), бокові
						// ліва/права — лише ширину рамки переносу (`transformPatch` розрізняє через
						// `getActiveAnchor()`). Верхня/нижня середні ручки прибрані — висота для тексту й так
						// завжди авто-рахується з перенесених рядків, незалежний drag по ній нічого не значив.
						enabledAnchors={
							selected.length > 0 && selected.every((id) => elements[id]?.type === 'text')
								? ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right']
								: undefined
						}
						borderStroke={canvasTheme.selectionStroke}
						anchorStroke={canvasTheme.selectionStroke}
						anchorFill="#ffffff"
						anchorCornerRadius={4}
					/>
					{/* Лінії-підказки прив'язки до інших фігур — в екранних координатах (не в Group), тож
					    завжди на весь видимий канвас незалежно від пан/зуму, як ручки Transformer'а вище. */}
					{snapGuides.x !== null && (
						<Line
							points={[toScreen(snapGuides.x, 0, view).x, 0, toScreen(snapGuides.x, 0, view).x, height]}
							stroke={canvasTheme.snapGuideStroke}
							strokeWidth={1}
							dash={[4, 4]}
							listening={false}
						/>
					)}
					{snapGuides.y !== null && (
						<Line
							points={[0, toScreen(0, snapGuides.y, view).y, width, toScreen(0, snapGuides.y, view).y]}
							stroke={canvasTheme.snapGuideStroke}
							strokeWidth={1}
							dash={[4, 4]}
							listening={false}
						/>
					)}
				</Layer>
			</Stage>
			<CommentPins
				comments={Object.values(comments)}
				view={view}
				activeCommentId={activeCommentId}
				onSelect={(id) => {
					setActiveComment(id);
					setCommentsOpen(true);
				}}
			/>
			<EmbedOverlays elements={els.filter((el) => el.type === 'embed')} selected={selected} activeEmbedId={activeEmbedId} view={view} />
			<PresenceCursors presence={presence} selfUid={uid} view={view} />
			<LaserTrails own={ownLaserPoints} ownUid={uid} presence={presence} selfUid={uid} view={view} />
			{composerAt && (
				<CommentComposer
					x={composerAt.x}
					y={composerAt.y}
					view={view}
					onCommit={(text) => {
						addComment(composerAt.x, composerAt.y, text);
						setComposerAt(null);
					}}
					onCancel={() => setComposerAt(null)}
				/>
			)}
			{renamingFrameId && elements[renamingFrameId] && (
				<FrameLabelEditor
					element={elements[renamingFrameId]}
					view={view}
					onCommit={(text) => {
						renameFrame(renamingFrameId, text);
						setRenamingFrameId(null);
					}}
					onCancel={() => setRenamingFrameId(null)}
				/>
			)}
			{editingElement && (
				<TextEditorOverlay
					element={editingElement}
					view={view}
					onCommit={(text, w, h) => {
						updateElementLive(editingElement.id, { text, width: w, height: h });
						finishElement(editingElement.id);
						setEditingTextId(null);
					}}
					onCancel={() => {
						cancelElement(editingElement.id);
						setEditingTextId(null);
					}}
				/>
			)}
		</div>
	);
}

function elBounds(el: ReturnType<typeof visibleElements>[number]): GeomRect {
	return { x: el.x, y: el.y, width: el.width, height: el.height };
}
