const SVG_NS = 'http://www.w3.org/2000/svg';
const HOST_ATTR = 'data-murano-defs';

/**
 * One shared 0×0 SVG per document tree holding every filter definition.
 *
 * Two constraints drive this:
 *
 * 1. The host must NOT be `display: none`. Filters inside a `display: none` subtree do not
 *    apply. Size zero with `position: absolute` and `overflow: hidden` takes it out of layout
 *    without disabling it.
 * 2. `url(#id)` resolves against the element's own tree scope, so a filter defined in the light
 *    DOM is unreachable from inside a shadow root. The host is therefore created per root node,
 *    not per document.
 */

const hosts = new WeakMap<Node, { svg: SVGSVGElement; refs: number }>();

function createHost(): SVGSVGElement {
	const svg = document.createElementNS(SVG_NS, 'svg');
	svg.setAttribute(HOST_ATTR, '');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('focusable', 'false');
	svg.setAttribute('width', '0');
	svg.setAttribute('height', '0');
	// Not `display: none`: filters in a display:none subtree do not apply.
	svg.style.cssText =
		'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;contain:strict';
	svg.append(document.createElementNS(SVG_NS, 'defs'));
	return svg;
}

/** Root node that owns filter ids for this element: a shadow root, or the document. */
function rootOf(el: Element): Document | ShadowRoot {
	const root = el.getRootNode();
	return root instanceof ShadowRoot ? root : el.ownerDocument;
}

/** Acquire the shared defs container for an element's tree scope, refcounted. */
export function acquireDefs(el: Element): SVGDefsElement {
	const root = rootOf(el);
	const existing = hosts.get(root);
	if (existing) {
		existing.refs += 1;
		return existing.svg.firstElementChild as SVGDefsElement;
	}

	const svg = createHost();
	const parent = root instanceof ShadowRoot ? root : root.body;
	parent.append(svg);
	hosts.set(root, { svg, refs: 1 });
	return svg.firstElementChild as SVGDefsElement;
}

/** Release one reference. The host is removed when the last surface unmounts. */
export function releaseDefs(el: Element): void {
	const root = rootOf(el);
	const entry = hosts.get(root);
	if (!entry) return;
	entry.refs -= 1;
	if (entry.refs <= 0) {
		entry.svg.remove();
		hosts.delete(root);
	}
}

let counter = 0;

/** Collision-proof filter id. Not crypto, just unique within the page. */
export function nextFilterId(): string {
	counter += 1;
	return `murano-${counter.toString(36)}`;
}
