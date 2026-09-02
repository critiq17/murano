const STYLE_ATTR = 'data-murano-styles';

/**
 * Per-instance CSS rules, held in one stylesheet per tree scope.
 *
 * The optics do NOT go in the host's inline style. A consumer who drives a dynamic `style`
 * attribute (`style="translate: {x}px {y}px"` on a draggable surface, say) makes the framework
 * rewrite that whole attribute, which silently wipes every property the library set: the
 * refraction, the tint, the custom properties, all of it. The surface reverts to a plain box
 * until something else triggers a re-apply.
 *
 * Owning a rule instead means the inline style belongs entirely to the consumer, and the two
 * can never collide. Per-frame interaction values stay inline, because they are rewritten on
 * the next frame anyway and a style-rule mutation there would cost a document-wide recalc.
 */

const sheets = new WeakMap<Node, { el: HTMLStyleElement; refs: number }>();

function rootOf(el: Element): Document | ShadowRoot {
	const root = el.getRootNode();
	return root instanceof ShadowRoot ? root : el.ownerDocument;
}

function acquireSheet(el: Element): CSSStyleSheet | null {
	const root = rootOf(el);
	const existing = sheets.get(root);
	if (existing) {
		existing.refs += 1;
		return existing.el.sheet;
	}

	const doc = el.ownerDocument;
	const style = doc.createElement('style');
	style.setAttribute(STYLE_ATTR, '');
	// Appended last so it wins ties against the library's own base stylesheet, while a
	// consumer's later or more specific selector still overrides it.
	const parent = root instanceof ShadowRoot ? root : doc.head;
	parent.append(style);
	sheets.set(root, { el: style, refs: 1 });
	return style.sheet;
}

function releaseSheet(el: Element): void {
	const root = rootOf(el);
	const entry = sheets.get(root);
	if (!entry) return;
	entry.refs -= 1;
	if (entry.refs <= 0) {
		entry.el.remove();
		sheets.delete(root);
	}
}

export interface GlassRule {
	/** Declarations for this instance. Mutate directly; no re-insert needed. */
	readonly style: CSSStyleDeclaration | null;
	dispose(): void;
}

/**
 * Claim a rule matching `[data-murano-id="<id>"]`. The caller is responsible for putting that
 * attribute on the element.
 */
export function acquireRule(el: Element, id: string): GlassRule {
	const sheet = acquireSheet(el);
	const selector = `[data-murano-id="${id}"]`;
	let rule: CSSStyleRule | null = null;

	if (sheet) {
		try {
			const index = sheet.insertRule(`${selector}{}`, sheet.cssRules.length);
			rule = sheet.cssRules[index] as CSSStyleRule;
		} catch {
			rule = null;
		}
	}

	return {
		get style() {
			return rule?.style ?? null;
		},
		dispose() {
			if (sheet && rule) {
				// Indices shift as other instances come and go, so find the rule by identity.
				for (let i = 0; i < sheet.cssRules.length; i += 1) {
					if (sheet.cssRules[i] === rule) {
						sheet.deleteRule(i);
						break;
					}
				}
			}
			rule = null;
			releaseSheet(el);
		}
	};
}

let counter = 0;

export function nextInstanceId(): string {
	counter += 1;
	return `m${counter.toString(36)}`;
}
