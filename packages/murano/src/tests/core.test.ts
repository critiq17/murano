import { describe, expect, it, afterEach } from 'vitest';
import {
	resolveEngine,
	resetCapabilities,
	type Capabilities,
	type Preferences
} from '$lib/core/detect.js';
import { displacementPad, axisScaleMatrix, buildFilter } from '$lib/core/filter.js';
import { generateMap, shapeKey } from '$lib/core/displacement.js';
import { getMap, clearMapCache, mapCacheSize } from '$lib/core/cache.js';
import { resolveSource } from '$lib/core/source.js';
import { createGlass } from '$lib/core/glass.js';
import type { MapShape } from '$lib/core/types.js';

const caps = (o: Partial<Capabilities> = {}): Capabilities => ({
	backdropUrl: false,
	filterUrl: false,
	backdropBlur: false,
	...o
});
const prefs = (o: Partial<Preferences> = {}): Preferences => ({
	reducedTransparency: false,
	reducedMotion: false,
	moreContrast: false,
	forcedColors: false,
	...o
});

// A 300x200 element. With pad 62 the filter region is 424x324, so the silhouette spans
// columns 62..362 and rows 62..262, and its centre is (212, 162).
const SHAPE: MapShape = {
	width: 300,
	height: 200,
	pad: 62,
	radius: 24,
	edge: 0.12,
	curvature: 0.35,
	sheenAngle: 135,
	sheenWidth: 0.09,
	glow: 0.12,
	specular: 0.5
};

afterEach(() => {
	resetCapabilities(null);
	clearMapCache();
});

describe('degradation ladder', () => {
	const all = caps({ backdropUrl: true, filterUrl: true, backdropBlur: true });

	it('prefers backdrop when the live-page bend is available', () => {
		expect(resolveEngine('auto', true, all, prefs())).toBe('backdrop');
	});

	it('falls to lens when only element filters work and a source resolves', () => {
		expect(
			resolveEngine('auto', true, caps({ filterUrl: true, backdropBlur: true }), prefs())
		).toBe('lens');
	});

	it('falls to frost when the lens has nothing to refract', () => {
		expect(
			resolveEngine('auto', false, caps({ filterUrl: true, backdropBlur: true }), prefs())
		).toBe('frost');
	});

	it('returns none when nothing at all is supported', () => {
		expect(resolveEngine('auto', true, caps(), prefs())).toBe('none');
	});

	it('degrades an unsupported explicit request instead of breaking', () => {
		// engine="backdrop" in a browser without it must still render something.
		expect(
			resolveEngine('backdrop', true, caps({ filterUrl: true, backdropBlur: true }), prefs())
		).toBe('lens');
		expect(resolveEngine('lens', false, caps({ backdropBlur: true }), prefs())).toBe('frost');
	});

	it('lets accessibility override an explicit engine', () => {
		expect(resolveEngine('backdrop', true, all, prefs({ forcedColors: true }))).toBe('none');
		expect(resolveEngine('backdrop', true, all, prefs({ reducedTransparency: true }))).toBe(
			'frost'
		);
	});

	it('honours engine="none"', () => {
		expect(resolveEngine('none', true, all, prefs())).toBe('none');
	});
});

describe('filter region', () => {
	it('scales the pad with displacement and chroma', () => {
		expect(displacementPad(-112, 6)).toBe(62);
		expect(displacementPad(-200, 10)).toBe(110);
	});

	it('never collapses on a small element', () => {
		// A 10% default region on a 48px element is 4.8px, which clips the effect away.
		expect(displacementPad(-4, 0)).toBe(20);
		expect(displacementPad(0, 0)).toBe(20);
	});

	it('expands the filter region beyond the element box', () => {
		const filter = buildFilter({
			id: 't1',
			width: 300,
			height: 200,
			pad: 62,
			displacement: -112,
			chromatic: 6,
			blur: 3,
			specular: 0.5,
			map: 'data:,'
		});
		expect(parseFloat(filter.getAttribute('x')!)).toBeLessThan(0);
		expect(parseFloat(filter.getAttribute('width')!)).toBeGreaterThan(100);
		expect(filter.getAttribute('color-interpolation-filters')).toBe('sRGB');
	});

	it('emits three passes with chroma and one without', () => {
		const base = {
			id: 't',
			width: 300,
			height: 200,
			pad: 62,
			displacement: -112,
			blur: 0,
			specular: 0,
			map: 'data:,'
		};
		expect(
			buildFilter({ ...base, chromatic: 6 }).querySelectorAll('feDisplacementMap')
		).toHaveLength(3);
		expect(
			buildFilter({ ...base, chromatic: 0 }).querySelectorAll('feDisplacementMap')
		).toHaveLength(1);
	});

	it('bends blue hardest, which is the physical ordering', () => {
		const f = buildFilter({
			id: 't2',
			width: 300,
			height: 200,
			pad: 62,
			displacement: -112,
			chromatic: 6,
			blur: 0,
			specular: 0,
			map: 'data:,'
		});
		const scales = [...f.querySelectorAll('feDisplacementMap')].map((n) =>
			Number(n.getAttribute('scale'))
		);
		expect(Math.abs(scales[2]!)).toBeGreaterThan(Math.abs(scales[0]!));
	});

	it('scales map axes around the 0.5 neutral point', () => {
		expect(axisScaleMatrix(1, 1)).toContain('1 0 0 0 0');
		expect(axisScaleMatrix(2, 2)).toContain('2 0 0 0 -0.5');
	});
});

describe('displacement map', () => {
	function sample(uri: string, points: [number, number][]): Promise<string[]> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onerror = reject;
			img.onload = () => {
				const cv = document.createElement('canvas');
				cv.width = img.width;
				cv.height = img.height;
				const cx = cv.getContext('2d')!;
				cx.drawImage(img, 0, 0);
				resolve(
					points.map(([x, y]) => {
						const d = cx.getImageData(x, y, 1, 1).data;
						return `${d[0]},${d[1]}`;
					})
				);
			};
			img.src = uri;
		});
	}

	it('keeps the centre optically neutral', async () => {
		const uri = generateMap(SHAPE);
		const [centre] = await sample(uri, [[212, 162]]);
		expect(centre).toBe('128,128');
	});

	it('leaves everything outside the silhouette neutral', async () => {
		const uri = generateMap(SHAPE);
		const outside = await sample(uri, [
			[2, 2],
			[2, 162],
			[421, 2]
		]);
		expect(outside).toEqual(['128,128', '128,128', '128,128']);
	});

	it('displaces the rim outward and symmetrically', async () => {
		const uri = generateMap(SHAPE);
		// Element box spans 62..362 horizontally, 62..262 vertically.
		const [left, right, top, bottom] = await sample(uri, [
			[65, 162],
			[358, 162],
			[212, 65],
			[212, 258]
		]);
		const lx = Number(left!.split(',')[0]);
		const rx = Number(right!.split(',')[0]);
		const ty = Number(top!.split(',')[1]);
		const by = Number(bottom!.split(',')[1]);
		expect(lx).toBeLessThan(100); // pushed left
		expect(rx).toBeGreaterThan(155); // pushed right
		expect(ty).toBeLessThan(100); // pushed up
		expect(by).toBeGreaterThan(155); // pushed down
		expect(Math.abs(128 - lx - (rx - 128))).toBeLessThan(4);
	});

	it('is not a uniform shear', async () => {
		// The classic failure: a gradient map moves every pixel the same way.
		const uri = generateMap(SHAPE);
		const [centre, rim] = await sample(uri, [
			[212, 162],
			[65, 162]
		]);
		expect(centre).not.toBe(rim);
	});
});

describe('map cache', () => {
	it('serves one texture per shape', () => {
		const a = getMap(SHAPE, 1);
		const b = getMap(SHAPE, 1);
		expect(a).toBe(b);
		expect(mapCacheSize()).toBe(1);
	});

	it('keys on shape, not position', () => {
		expect(shapeKey(SHAPE, 1)).toBe(shapeKey({ ...SHAPE }, 1));
		expect(shapeKey(SHAPE, 1)).not.toBe(shapeKey({ ...SHAPE, radius: 40 }, 1));
	});
});

describe('source resolution', () => {
	function withDom(bg: string, run: (host: HTMLElement) => void) {
		const parent = document.createElement('div');
		parent.style.cssText = `width:400px;height:300px;background:${bg}`;
		const host = document.createElement('div');
		parent.append(host);
		document.body.append(parent);
		try {
			run(host);
		} finally {
			parent.remove();
		}
	}

	it('finds the nearest painted ancestor', () => {
		withDom('rgb(255, 255, 0)', (host) => {
			// An opaque yellow must not be read as transparent: the blue channel is 0.
			expect(resolveSource(host, 'auto')?.element).toBe(host.parentElement);
		});
	});

	it('skips a fully transparent ancestor', () => {
		withDom('rgba(0, 0, 0, 0)', (host) => {
			expect(resolveSource(host, 'auto')?.element).not.toBe(host.parentElement);
		});
	});

	it('returns nothing for source="none" so the ladder falls to frost', () => {
		withDom('rgb(20, 20, 30)', (host) => {
			expect(resolveSource(host, 'none')).toBeNull();
		});
	});

	it('accepts an explicit image', () => {
		withDom('none', (host) => {
			const r = resolveSource(host, { image: '/bg.avif' });
			expect(r?.style['background-image']).toContain('/bg.avif');
		});
	});
});

describe('surviving a consumer-owned style attribute', () => {
	function mount() {
		const parent = document.createElement('div');
		parent.style.cssText = 'width:600px;height:400px;background:rgb(20, 20, 30)';
		const host = document.createElement('div');
		host.style.cssText = 'width:300px;height:200px';
		parent.append(host);
		document.body.append(parent);
		return { parent, host };
	}

	it('keeps the optics when the host style attribute is rewritten', async () => {
		const { parent, host } = mount();
		const glass = createGlass(host, { radius: 32 });
		try {
			expect(host.getAttribute('data-murano-id')).toBeTruthy();

			// Exactly what a framework does when a dynamic `style="translate: ..."` updates:
			// the whole attribute is replaced, taking any inline properties with it.
			host.setAttribute('style', 'translate: 40px 12px');

			const resolved = getComputedStyle(host);
			expect(resolved.getPropertyValue('--murano-radius').trim()).toBe('32px');
			if (glass.engine === 'backdrop' || glass.engine === 'frost') {
				expect(resolved.backdropFilter).not.toBe('none');
			}
		} finally {
			glass.destroy();
			parent.remove();
		}
	});

	it('removes every artifact on destroy', () => {
		const { parent, host } = mount();
		const glass = createGlass(host, {});
		glass.destroy();
		expect(host.getAttribute('data-murano-id')).toBeNull();
		expect(host.getAttribute('data-murano-engine')).toBeNull();
		expect(host.querySelector('[data-murano-layer]')).toBeNull();
		expect(getComputedStyle(host).getPropertyValue('--murano-radius').trim()).toBe('');
		parent.remove();
	});
});
