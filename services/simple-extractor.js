const axios = require('axios');
const cheerio = require('cheerio');

class SimpleExtractor {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    }

    async extractFromUrl(url) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': this.userAgent
                },
                timeout: 10000
            });

            const $ = cheerio.load(response.data);
            const domain = new URL(url).hostname;

            // Extract title
            let title = $('title').text().trim() ||
                       $('h1').first().text().trim() ||
                       'Untitled Article';

            // Extract author
            let author = $('meta[name="author"]').attr('content') ||
                        $('[rel="author"]').text().trim() ||
                        $('.author').first().text().trim() ||
                        '';

            // Extract content - try multiple selectors
            let content = '';
            const contentSelectors = [
                'article',
                '.content',
                '.post-content',
                '.entry-content',
                '.article-content',
                'main',
                '[role="main"]'
            ];

            for (const selector of contentSelectors) {
                const element = $(selector);
                if (element.length > 0 && element.text().trim().length > content.length) {
                    content = element.html();
                }
            }

            // Fallback to body if no content found
            if (!content) {
                content = $('body').html();
            }

            // Clean up content
            content = this.cleanContent(content);

            // Generate excerpt
            const textContent = cheerio.load(content).text();
            const excerpt = textContent.substring(0, 200).trim() + (textContent.length > 200 ? '...' : '');

            // Calculate reading time (average 200 words per minute)
            const wordCount = textContent.split(/\s+/).length;
            const readingTime = Math.ceil(wordCount / 200);

            return {
                url,
                title: this.cleanText(title),
                content,
                excerpt,
                author: this.cleanText(author),
                domain,
                word_count: wordCount,
                reading_time: readingTime,
                publish_date: this.extractPublishDate($) || ''
            };

        } catch (error) {
            throw new Error(`Failed to extract content: ${error.message}`);
        }
    }

    cleanContent(html) {
        if (!html) return '';
        
        const $ = cheerio.load(html);
        
        // Remove unwanted elements
        $('script, style, nav, header, footer, aside, .sidebar, .ad, .advertisement, .social-share').remove();
        
        return $.html();
    }

    cleanText(text) {
        return text ? text.replace(/\s+/g, ' ').trim() : '';
    }

    extractPublishDate($) {
        // Try various meta tags and selectors for publish date
        const dateSelectors = [
            'meta[property="article:published_time"]',
            'meta[name="article:published_time"]',
            'meta[name="date"]',
            'time[datetime]',
            '.publish-date',
            '.date'
        ];

        for (const selector of dateSelectors) {
            const element = $(selector);
            if (element.length > 0) {
                const dateStr = element.attr('content') || element.attr('datetime') || element.text();
                if (dateStr) {
                    const date = new Date(dateStr);
                    if (!isNaN(date.getTime())) {
                        return date.toISOString();
                    }
                }
            }
        }

        return '';
    }

    async close() {
        // Nothing to close for axios
    }
}

module.exports = SimpleExtractor;