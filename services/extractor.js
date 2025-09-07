const { chromium } = require('playwright');
const cheerio = require('cheerio');
const axios = require('axios');

class ContentExtractor {
  constructor() {
    this.browser = null;
  }

  async init() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
  }

  async extractFromUrl(url) {
    try {
      await this.init();

      const context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      });
      
      const page = await context.newPage();
      
      await page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });

      const content = await page.evaluate(() => {
        const removeElements = (selectors) => {
          selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => el.remove());
          });
        };

        removeElements([
          'script', 'style', 'nav', 'header', 'footer',
          '.advertisement', '.ads', '.social-share',
          '.comments', '.sidebar', '.related-articles'
        ]);

        const title = document.title ||
                     document.querySelector('h1')?.textContent ||
                     document.querySelector('[property="og:title"]')?.content ||
                     '';

        const author = document.querySelector('[name="author"]')?.content ||
                      document.querySelector('[property="article:author"]')?.content ||
                      document.querySelector('.author')?.textContent ||
                      '';

        const description = document.querySelector('[name="description"]')?.content ||
                          document.querySelector('[property="og:description"]')?.content ||
                          '';

        const articleSelectors = [
          'article',
          '[role="main"]',
          '.content',
          '.article-content',
          '.post-content',
          '.entry-content',
          'main'
        ];

        let contentElement = null;
        for (const selector of articleSelectors) {
          contentElement = document.querySelector(selector);
          if (contentElement) break;
        }

        if (!contentElement) {
          contentElement = document.body;
        }

        const textContent = contentElement.innerText || contentElement.textContent || '';
        const htmlContent = contentElement.innerHTML || '';

        return {
          title: title.trim(),
          author: author.trim(),
          description: description.trim(),
          textContent: textContent.trim(),
          htmlContent: htmlContent.trim()
        };
      });

      await context.close();

      const domain = new URL(url).hostname;
      const wordCount = content.textContent.split(/\s+/).filter(word => word.length > 0).length;
      const readingTime = Math.ceil(wordCount / 250); // 250 words per minute

      // Extract publish date
      const publishDate = await page.evaluate(() => {
        const dateSelectors = [
          '[property="article:published_time"]',
          '[name="date"]',
          '[property="article:published"]',
          '.publish-date',
          '.publication-date',
          '[datetime]'
        ];
        
        for (const selector of dateSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            return element.getAttribute('content') || 
                   element.getAttribute('datetime') || 
                   element.textContent;
          }
        }
        return null;
      });

      return {
        url,
        title: content.title || 'Untitled',
        content: content.htmlContent,
        excerpt: content.description || this.generateExcerpt(content.textContent),
        author: content.author,
        domain,
        word_count: wordCount,
        reading_time: readingTime,
        publish_date: this.parseDate(publishDate),
        tags: this.extractTags(content.textContent, content.title, domain)
      };

    } catch (error) {
      console.error('Error extracting content:', error);
      
      try {
        const fallbackData = await this.fallbackExtraction(url);
        return fallbackData;
      } catch (fallbackError) {
        throw new Error(`Content extraction failed: ${error.message}`);
      }
    }
  }

  async fallbackExtraction(url) {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);

    $('script, style, nav, header, footer').remove();

    const title = $('title').text() || 
                 $('h1').first().text() || 
                 $('[property="og:title"]').attr('content') || 
                 '';

    const author = $('[name="author"]').attr('content') || 
                  $('[property="article:author"]').attr('content') || 
                  $('.author').first().text() || 
                  '';

    const description = $('[name="description"]').attr('content') || 
                       $('[property="og:description"]').attr('content') || 
                       '';

    let content = $('article').html() || 
                 $('[role="main"]').html() || 
                 $('.content').html() || 
                 $('main').html() || 
                 $('body').html() || 
                 '';

    const textContent = $('article').text() || 
                       $('[role="main"]').text() || 
                       $('.content').text() || 
                       $('main').text() || 
                       $('body').text() || 
                       '';

    const domain = new URL(url).hostname;
    const wordCount = textContent.split(/\s+/).filter(word => word.length > 0).length;
    const readingTime = Math.ceil(wordCount / 250);

    // Extract publish date from HTML
    const publishDate = $('[property="article:published_time"]').attr('content') ||
                       $('[name="date"]').attr('content') ||
                       $('.publish-date').first().text() ||
                       null;

    return {
      url,
      title: title.trim() || 'Untitled',
      content: content.trim(),
      excerpt: description.trim() || this.generateExcerpt(textContent),
      author: author.trim(),
      domain,
      word_count: wordCount,
      reading_time: readingTime,
      publish_date: this.parseDate(publishDate),
      tags: this.extractTags(textContent, title, domain)
    };
  }

  generateExcerpt(text) {
    if (!text) return '';
    
    // Clean up text and extract first few sentences
    const cleaned = text.replace(/\s+/g, ' ').trim();
    const sentences = cleaned.split(/[.!?]+/).filter(s => s.length > 10);
    
    let excerpt = '';
    for (const sentence of sentences) {
      if (excerpt.length + sentence.length > 300) break;
      excerpt += sentence.trim() + '. ';
    }
    
    return excerpt.trim() || cleaned.substring(0, 300).trim() + '...';
  }

  parseDate(dateString) {
    if (!dateString) return null;
    
    try {
      const date = new Date(dateString.trim());
      return date.getTime() && !isNaN(date.getTime()) ? date.toISOString() : null;
    } catch {
      return null;
    }
  }

  extractTags(content, title, domain) {
    const text = (content + ' ' + title).toLowerCase();
    
    // Domain-specific tags
    const domainTags = this.getDomainTags(domain);
    
    // Technology tags
    const techTags = [
      'javascript', 'python', 'react', 'vue', 'angular', 'node', 'express',
      'typescript', 'go', 'rust', 'java', 'kotlin', 'swift', 'php', 'ruby',
      'html', 'css', 'sass', 'tailwind', 'bootstrap', 'web', 'api', 'rest',
      'graphql', 'database', 'sql', 'mongodb', 'postgresql', 'mysql', 'redis',
      'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'cloud', 'serverless'
    ];
    
    // Content type tags
    const contentTags = [
      'tutorial', 'guide', 'tips', 'how-to', 'development', 'programming',
      'coding', 'tech', 'software', 'design', 'ux', 'ui', 'mobile', 'web-dev',
      'frontend', 'backend', 'fullstack', 'devops', 'ai', 'machine-learning',
      'data-science', 'security', 'cybersecurity', 'blockchain', 'startup',
      'business', 'productivity', 'career', 'interview', 'architecture'
    ];

    const allTags = [...domainTags, ...techTags, ...contentTags];
    const foundTags = allTags.filter(tag => {
      const variations = [
        tag,
        tag.replace('-', ' '),
        tag.replace(' ', '-'),
        tag.replace('js', 'javascript'),
        tag.replace('ai', 'artificial intelligence'),
        tag.replace('ml', 'machine learning')
      ];
      return variations.some(variation => text.includes(variation));
    });

    // Remove duplicates and limit to 8 tags
    return [...new Set(foundTags)].slice(0, 8);
  }

  getDomainTags(domain) {
    const domainMap = {
      'dev.to': ['dev', 'community'],
      'medium.com': ['medium', 'blog'],
      'hackernews.com': ['hackernews', 'tech'],
      'stackoverflow.com': ['stackoverflow', 'qa'],
      'github.com': ['github', 'code', 'open-source'],
      'reddit.com': ['reddit', 'discussion'],
      'youtube.com': ['video', 'tutorial'],
      'techcrunch.com': ['news', 'startup'],
      'wired.com': ['news', 'tech'],
      'arstechnica.com': ['news', 'tech'],
      'smashingmagazine.com': ['web-design', 'frontend'],
      'css-tricks.com': ['css', 'frontend'],
      'freecodecamp.org': ['tutorial', 'learning']
    };
    
    return domainMap[domain] || [];
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = ContentExtractor;