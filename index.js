const puppeteer = require('puppeteer-extra'),
	StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())
const { writeFile } = require('node:fs/promises')
const pageUrl = 'https://www.facebook.com/10ways'
let known
try {
	known = require('./known.json')
} catch {}

async function getPosts() {
	const browser = await puppeteer.launch({channel: 'chrome', headless: 'new'})
	const page = await browser.newPage()

	await page.goto(pageUrl)

	// accept cookies
	const cookiesSelector = '[aria-label="Allow all cookies"]'
	await page.waitForSelector(cookiesSelector)
	await page.click(cookiesSelector)

	// close login prompt
	const closeSelector = '[aria-label="Close"]'
	await page.waitForSelector(closeSelector)
	await page.click(closeSelector)

	// force load more posts
	await new Promise(resolve => setTimeout(resolve, 100))
	await page.keyboard.down('ArrowDown')
	await new Promise(resolve => setTimeout(resolve, 2500))
	await page.keyboard.up('ArrowDown')
	await new Promise(resolve => setTimeout(resolve, 100))

	// expand 'See More'
	for (const b of await page.$$('[data-ad-preview="message"] [role="button"]')) {
		b.click()
	}

	const results = []

	// iterate posts
	for (const e of await page.$$('[aria-posinset]')) {
		let imgs = [],
			text = []

		// replace emojis
		for (const emoji of await e.$$('img[src*="emoji"]')) {
			emoji.evaluate(x => x.innerHTML = x.alt)
		}

		// extract images
		for (const img of await e.$$('img[src*="scontent-"]')) {
			imgs.push(await img.evaluate(x => x.src))
		}

		// extract post link
		const link = (await e.$eval('a[href*="/posts/"]', x => x.href)).split('?')[0]
		const hash = /\/posts\/(.+)/.exec(link)[1]

		// extract text
		for (const div of await e.$$('[data-ad-preview="message"] div[dir="auto"]')) {
			text.push(await div.evaluate(x => x.textContent))
		}
		text = text.join('\n\n').replace(/ \(aff ads?\)/g, '')

		results.push({hash, link, imgs, text})
	}

	await browser.close()

	if (known) {
		results = results.filter(item => !known.includes(item.hash))
	}

	known = results.map(i => i.hash)
	await writeFile('./known.json', JSON.stringify(known))

	return results
}

;(async () => {
	let posts = await getPosts()

	for (const post of posts) {
		const payload = {
			embeds: [
				{
					description: post.text,
					url: post.link
				}
			]
		}

		for (const i in post.imgs) {
			if (i == 0) {
				payload.embeds[0].image = {
					url: post.imgs[0]
				}
			} else {
/*				payload.embeds.push({
					image: {
						url: post.imgs[i]
					}
				})
*/			}
		}

		const request = new Request(
			process.env.WEBHOOK_URL,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(payload)
			}
		)
		await fetch(request)
	}
})()
