import { visit, SKIP } from 'unist-util-visit';

/**
 * Get text content from a hast heading node,
 * skipping anchor elements added by rehype-autolink-headings.
 */
function getHeadingText(node) {
	let text = '';

	function traverse(n) {
		if (n.type === 'text') {
			text += n.value;
			return;
		}
		if (n.type === 'element') {
			// Skip <a class="anchor"> added by rehype-autolink-headings
			const classes = Array.isArray(n.properties?.className)
				? n.properties.className
				: [];
			if (n.tagName === 'a' && classes.includes('anchor')) {
				return;
			}
			for (const child of n.children || []) {
				traverse(child);
			}
		}
	}

	for (const child of node.children || []) {
		traverse(child);
	}

	return text.trim();
}

/** Get all text content from a hast node (including descendants). */
function getAllText(node) {
	if (node.type === 'text') return node.value;
	if (!node.children) return '';
	return node.children.map(getAllText).join('');
}

/**
 * Rehype plugin that replaces `[TOC]` paragraphs with an inline table of
 * contents built from the document's headings.
 *
 * Must run after rehype-slug (to have IDs) and after
 * rehype-autolink-headings (to correctly strip anchor-link text).
 */
export function rehypeInlineToc() {
	return (tree) => {
		// 1. Collect all headings that have an ID (set by rehype-slug)
		const headings = [];
		visit(tree, 'element', (node) => {
			if (/^h[1-6]$/.test(node.tagName) && node.properties?.id) {
				headings.push({
					depth: parseInt(node.tagName[1], 10),
					id: String(node.properties.id),
					text: getHeadingText(node),
				});
			}
		});

		if (!headings.length) return;

		const minDepth = Math.min(...headings.map((h) => h.depth));

		// 2. Find every <p> whose full text is exactly "[TOC]" and replace it
		visit(tree, 'element', (node, index, parent) => {
			if (node.tagName !== 'p') return;
			if (getAllText(node).trim() !== '[TOC]') return;

			const listNode = buildTocList(headings, minDepth);

			if (parent && index !== null && index !== undefined) {
				parent.children[index] = listNode;
				return [SKIP];
			}
		});
	};
}

function buildTocList(headings, minDepth) {
	return {
		type: 'element',
		tagName: 'ul',
		properties: { className: ['toc-inline'] },
		children: headings.map((heading) => ({
			type: 'element',
			tagName: 'li',
			properties: {
				className: [`toc-level-${heading.depth}`],
				style: `padding-left: ${(heading.depth - minDepth) * 1.25}em`,
			},
			children: [
				{
					type: 'element',
					tagName: 'a',
					properties: { href: `#${heading.id}` },
					children: [{ type: 'text', value: heading.text }],
				},
			],
		})),
	};
}
