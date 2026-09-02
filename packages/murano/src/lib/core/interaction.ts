/**
 * Pointer-driven glare and elastic press.
 *
 * Two rules shape this file:
 *
 * 1. Nothing here touches framework reactivity. Every frame writes a CSS custom property, so a
 *    press costs one style write per frame instead of a component re-render.
 * 2. Nothing here writes `transform`. A consumer dragging a surface owns `translate`, so the
 *    press uses the independent `scale` property and the two never collide.
 */

export interface InteractionOptions {
	/** Move the glare with the pointer. */
	followPointer: boolean;
	/** Elastic squash on press. */
	press: boolean;
	/** How far the surface gives under a press, as a fraction. 0.02 is a 2% squash. */
	give: number;
}

/** Spring constants. Slightly under-damped, which is what reads as a material rather than a tween. */
const STIFFNESS = 0.14;
const DAMPING = 0.62;
/** Below this the spring has visually settled and the loop can stop. */
const REST = 0.0004;

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export function attachInteraction(host: HTMLElement, options: InteractionOptions): () => void {
	const doc = host.ownerDocument;
	const win = doc.defaultView;
	if (!win) return () => {};

	const motionQuery = win.matchMedia(REDUCED_MOTION);
	let reduced = motionQuery.matches;

	let glare = 0;
	let glareTarget = 0;
	let press = 0;
	let pressTarget = 0;
	let pressVelocity = 0;
	let raf = 0;
	let willChange = false;

	function setWillChange(on: boolean) {
		if (on === willChange) return;
		willChange = on;
		// Permanent `will-change` promotes every surface to its own layer and costs memory on a
		// page with many of them, so it lives only for the duration of an interaction.
		host.style.setProperty('will-change', on ? 'scale, filter' : '');
	}

	function frame() {
		raf = 0;

		glare += (glareTarget - glare) * 0.18;
		if (Math.abs(glareTarget - glare) < 0.002) glare = glareTarget;

		pressVelocity += (pressTarget - press) * STIFFNESS;
		pressVelocity *= DAMPING;
		press += pressVelocity;

		host.style.setProperty('--murano-glare', glare.toFixed(4));
		host.style.setProperty('--murano-press', (1 - press * options.give).toFixed(5));

		const settled =
			glare === glareTarget &&
			Math.abs(pressTarget - press) < REST &&
			Math.abs(pressVelocity) < REST;

		if (settled) {
			press = pressTarget;
			host.style.setProperty('--murano-press', (1 - press * options.give).toFixed(5));
			if (glareTarget === 0 && pressTarget === 0) setWillChange(false);
			return;
		}
		raf = requestAnimationFrame(frame);
	}

	function kick() {
		if (raf === 0) raf = requestAnimationFrame(frame);
	}

	function onEnter() {
		if (reduced || !options.followPointer) return;
		glareTarget = 1;
		setWillChange(true);
		kick();
	}

	function onMove(event: PointerEvent) {
		if (reduced || !options.followPointer) return;
		const rect = host.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return;
		// Written straight to custom properties: no state, no diff, no re-render.
		host.style.setProperty(
			'--murano-light-x',
			`${(((event.clientX - rect.left) / rect.width) * 100).toFixed(2)}%`
		);
		host.style.setProperty(
			'--murano-light-y',
			`${(((event.clientY - rect.top) / rect.height) * 100).toFixed(2)}%`
		);
	}

	function onLeave() {
		glareTarget = 0;
		pressTarget = 0;
		kick();
	}

	function onDown() {
		if (reduced || !options.press) return;
		pressTarget = 1;
		setWillChange(true);
		kick();
	}

	function onUp() {
		if (reduced || !options.press) return;
		pressTarget = 0;
		kick();
	}

	function onMotionChange() {
		reduced = motionQuery.matches;
		if (reduced) {
			glareTarget = 0;
			pressTarget = 0;
			glare = 0;
			press = 0;
			pressVelocity = 0;
			host.style.removeProperty('--murano-glare');
			host.style.removeProperty('--murano-press');
			setWillChange(false);
		}
	}

	host.addEventListener('pointerenter', onEnter);
	host.addEventListener('pointermove', onMove);
	host.addEventListener('pointerleave', onLeave);
	host.addEventListener('pointerdown', onDown);
	host.addEventListener('pointerup', onUp);
	host.addEventListener('pointercancel', onUp);
	// Keyboard activation deserves the same feedback as a press.
	host.addEventListener('focus', onEnter);
	host.addEventListener('blur', onLeave);
	motionQuery.addEventListener('change', onMotionChange);

	return () => {
		cancelAnimationFrame(raf);
		host.removeEventListener('pointerenter', onEnter);
		host.removeEventListener('pointermove', onMove);
		host.removeEventListener('pointerleave', onLeave);
		host.removeEventListener('pointerdown', onDown);
		host.removeEventListener('pointerup', onUp);
		host.removeEventListener('pointercancel', onUp);
		host.removeEventListener('focus', onEnter);
		host.removeEventListener('blur', onLeave);
		motionQuery.removeEventListener('change', onMotionChange);
		host.style.removeProperty('--murano-glare');
		host.style.removeProperty('--murano-press');
		host.style.removeProperty('--murano-light-x');
		host.style.removeProperty('--murano-light-y');
		host.style.removeProperty('will-change');
	};
}
