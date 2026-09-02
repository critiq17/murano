import { createGlass } from '../core/glass.js';
import { attachInteraction } from '../core/interaction.js';
import type { GlassInit, GlassInstance } from '../core/types.js';

export interface GlassAttachmentOptions extends GlassInit {
	/** Elastic press plus a glare that follows the pointer. */
	interactive?: boolean;
}

/**
 * Headless attachment. Puts the optics on any element you already own.
 *
 * ```svelte
 * <div {@attach glass({ displacement: -90 })}>your element</div>
 * ```
 *
 * The element still needs the structural CSS, so import `murano/styles.css` once. Everything
 * `GlassSurface` adds on top of this is presentation: the variant curve, the tint prop, the
 * server-rendered frost state and the dev contrast check.
 */
export function glass(options: GlassAttachmentOptions = {}) {
	const { interactive = false, ...init } = options;

	return (node: Element) => {
		if (!(node instanceof HTMLElement)) return;

		const instance: GlassInstance = createGlass(node, init);
		const detach = interactive
			? attachInteraction(node, {
					followPointer: init.specular?.followPointer ?? true,
					press: true,
					give: 0.02
				})
			: null;

		return () => {
			detach?.();
			instance.destroy();
		};
	};
}
