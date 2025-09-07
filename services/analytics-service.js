class AnalyticsService {
    constructor(database) {
        this.db = database;
    }

    getOverallStats() {
        try {
            const articles = this.db.getAllArticles();
            const tags = this.db.getAllTags();
            const now = new Date();
            
            // Basic counts
            const totalArticles = articles.length;
            const readArticles = articles.filter(a => a.is_read).length;
            const unreadArticles = totalArticles - readArticles;
            const favoriteArticles = articles.filter(a => a.is_favorite).length;
            const archivedArticles = articles.filter(a => a.is_archived).length;

            // Time-based stats
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

            const todayArticles = articles.filter(a => new Date(a.created_at) >= today).length;
            const weekArticles = articles.filter(a => new Date(a.created_at) >= weekAgo).length;
            const monthArticles = articles.filter(a => new Date(a.created_at) >= monthAgo).length;

            const todayRead = articles.filter(a => a.last_read_at && new Date(a.last_read_at) >= today).length;
            const weekRead = articles.filter(a => a.last_read_at && new Date(a.last_read_at) >= weekAgo).length;
            const monthRead = articles.filter(a => a.last_read_at && new Date(a.last_read_at) >= monthAgo).length;

            // Reading stats
            const totalWordCount = articles.reduce((sum, a) => sum + (a.word_count || 0), 0);
            const totalReadingTime = articles.reduce((sum, a) => sum + (a.reading_time || 0), 0);
            const avgWordsPerArticle = totalArticles > 0 ? Math.round(totalWordCount / totalArticles) : 0;
            const avgReadingTime = totalArticles > 0 ? Math.round(totalReadingTime / totalArticles) : 0;

            // Progress stats
            const articlesWithProgress = articles.filter(a => (a.reading_progress || 0) > 0);
            const inProgressArticles = articlesWithProgress.filter(a => a.reading_progress < 1).length;
            const avgProgress = articlesWithProgress.length > 0 
                ? articlesWithProgress.reduce((sum, a) => sum + (a.reading_progress || 0), 0) / articlesWithProgress.length 
                : 0;

            return {
                total_articles: totalArticles,
                read_articles: readArticles,
                unread_articles: unreadArticles,
                favorite_articles: favoriteArticles,
                archived_articles: archivedArticles,
                in_progress_articles: inProgressArticles,
                total_tags: tags.length,
                
                time_stats: {
                    today: todayArticles,
                    this_week: weekArticles,
                    this_month: monthArticles,
                    today_read: todayRead,
                    week_read: weekRead,
                    month_read: monthRead
                },

                reading_stats: {
                    total_word_count: totalWordCount,
                    total_reading_time_minutes: totalReadingTime,
                    avg_words_per_article: avgWordsPerArticle,
                    avg_reading_time_minutes: avgReadingTime,
                    avg_progress: Math.round(avgProgress * 100),
                    completion_rate: totalArticles > 0 ? Math.round((readArticles / totalArticles) * 100) : 0
                }
            };
        } catch (error) {
            throw new Error(`Failed to get overall stats: ${error.message}`);
        }
    }

    getReadingTrends(days = 30) {
        try {
            const articles = this.db.getAllArticles();
            const now = new Date();
            const trends = [];

            for (let i = days - 1; i >= 0; i--) {
                const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

                const savedCount = articles.filter(a => {
                    const createdDate = new Date(a.created_at);
                    return createdDate >= dayStart && createdDate < dayEnd;
                }).length;

                const readCount = articles.filter(a => {
                    if (!a.last_read_at) return false;
                    const readDate = new Date(a.last_read_at);
                    return readDate >= dayStart && readDate < dayEnd;
                }).length;

                trends.push({
                    date: dayStart.toISOString().split('T')[0],
                    saved: savedCount,
                    read: readCount
                });
            }

            return trends;
        } catch (error) {
            throw new Error(`Failed to get reading trends: ${error.message}`);
        }
    }

    getTopDomains(limit = 10) {
        try {
            const articles = this.db.getAllArticles();
            const domainCounts = {};

            articles.forEach(article => {
                const domain = article.domain || 'unknown';
                domainCounts[domain] = (domainCounts[domain] || 0) + 1;
            });

            return Object.entries(domainCounts)
                .sort(([,a], [,b]) => b - a)
                .slice(0, limit)
                .map(([domain, count]) => ({
                    domain,
                    count,
                    percentage: Math.round((count / articles.length) * 100)
                }));
        } catch (error) {
            throw new Error(`Failed to get top domains: ${error.message}`);
        }
    }

    getTopTags(limit = 15) {
        try {
            const articles = this.db.getAllArticles();
            const tagCounts = {};

            articles.forEach(article => {
                const tags = this.parseArticleTags(article);
                tags.forEach(tag => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
            });

            return Object.entries(tagCounts)
                .sort(([,a], [,b]) => b - a)
                .slice(0, limit)
                .map(([tag, count]) => ({
                    tag,
                    count,
                    percentage: Math.round((count / articles.length) * 100)
                }));
        } catch (error) {
            throw new Error(`Failed to get top tags: ${error.message}`);
        }
    }

    getReadingPatterns() {
        try {
            const articles = this.db.getAllArticles().filter(a => a.last_read_at);
            
            // Hour of day analysis
            const hourCounts = new Array(24).fill(0);
            const dayCounts = new Array(7).fill(0);
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

            articles.forEach(article => {
                const readDate = new Date(article.last_read_at);
                hourCounts[readDate.getHours()]++;
                dayCounts[readDate.getDay()]++;
            });

            const hourlyPattern = hourCounts.map((count, hour) => ({
                hour,
                count,
                label: `${hour}:00`
            }));

            const dailyPattern = dayCounts.map((count, day) => ({
                day,
                count,
                label: dayNames[day]
            }));

            return {
                hourly_pattern: hourlyPattern,
                daily_pattern: dailyPattern,
                most_active_hour: hourCounts.indexOf(Math.max(...hourCounts)),
                most_active_day: dayCounts.indexOf(Math.max(...dayCounts)),
                total_reading_sessions: articles.length
            };
        } catch (error) {
            throw new Error(`Failed to get reading patterns: ${error.message}`);
        }
    }

    getProductivityMetrics() {
        try {
            const articles = this.db.getAllArticles();
            const now = new Date();
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

            // Reading velocity (articles read per day)
            const weekReadArticles = articles.filter(a => 
                a.last_read_at && new Date(a.last_read_at) >= weekAgo
            ).length;
            const monthReadArticles = articles.filter(a => 
                a.last_read_at && new Date(a.last_read_at) >= monthAgo
            ).length;

            const weeklyVelocity = Math.round(weekReadArticles / 7 * 10) / 10;
            const monthlyVelocity = Math.round(monthReadArticles / 30 * 10) / 10;

            // Queue management
            const queueSize = articles.filter(a => !a.is_read && !a.is_archived).length;
            const avgTimeToRead = this.calculateAverageTimeToRead();

            // Completion metrics
            const readArticles = articles.filter(a => a.is_read).length;
            const totalArticles = articles.length;
            const completionRate = totalArticles > 0 ? Math.round((readArticles / totalArticles) * 100) : 0;

            // Highlight and engagement metrics
            const articlesWithHighlights = articles.filter(a => {
                const highlights = this.db.getArticleHighlights(a.id);
                return highlights.length > 0;
            }).length;

            const highlightRate = readArticles > 0 ? Math.round((articlesWithHighlights / readArticles) * 100) : 0;

            return {
                reading_velocity: {
                    daily_average: weeklyVelocity,
                    weekly_total: weekReadArticles,
                    monthly_total: monthReadArticles,
                    monthly_average: monthlyVelocity
                },
                queue_metrics: {
                    current_queue_size: queueSize,
                    estimated_reading_time_hours: Math.round(queueSize * avgTimeToRead / 60),
                    avg_time_to_read_days: avgTimeToRead
                },
                engagement_metrics: {
                    completion_rate: completionRate,
                    highlight_rate: highlightRate,
                    articles_with_highlights: articlesWithHighlights,
                    favorite_rate: totalArticles > 0 ? Math.round((articles.filter(a => a.is_favorite).length / totalArticles) * 100) : 0
                }
            };
        } catch (error) {
            throw new Error(`Failed to get productivity metrics: ${error.message}`);
        }
    }

    calculateAverageTimeToRead() {
        try {
            const articles = this.db.getAllArticles().filter(a => a.is_read && a.last_read_at && a.created_at);
            
            if (articles.length === 0) return 0;

            const totalDays = articles.reduce((sum, article) => {
                const created = new Date(article.created_at);
                const read = new Date(article.last_read_at);
                const days = (read - created) / (1000 * 60 * 60 * 24);
                return sum + Math.max(0, days);
            }, 0);

            return Math.round(totalDays / articles.length);
        } catch (error) {
            return 0;
        }
    }

    getContentAnalysis() {
        try {
            const articles = this.db.getAllArticles();

            // Word count distribution
            const wordCountRanges = {
                'Short (< 500 words)': 0,
                'Medium (500-1500 words)': 0,
                'Long (1500-3000 words)': 0,
                'Very Long (> 3000 words)': 0
            };

            // Reading time distribution
            const readingTimeRanges = {
                'Quick Read (< 5 min)': 0,
                'Short Read (5-15 min)': 0,
                'Medium Read (15-30 min)': 0,
                'Long Read (> 30 min)': 0
            };

            articles.forEach(article => {
                const wordCount = article.word_count || 0;
                const readingTime = article.reading_time || 0;

                // Categorize by word count
                if (wordCount < 500) {
                    wordCountRanges['Short (< 500 words)']++;
                } else if (wordCount < 1500) {
                    wordCountRanges['Medium (500-1500 words)']++;
                } else if (wordCount < 3000) {
                    wordCountRanges['Long (1500-3000 words)']++;
                } else {
                    wordCountRanges['Very Long (> 3000 words)']++;
                }

                // Categorize by reading time
                if (readingTime < 5) {
                    readingTimeRanges['Quick Read (< 5 min)']++;
                } else if (readingTime < 15) {
                    readingTimeRanges['Short Read (5-15 min)']++;
                } else if (readingTime < 30) {
                    readingTimeRanges['Medium Read (15-30 min)']++;
                } else {
                    readingTimeRanges['Long Read (> 30 min)']++;
                }
            });

            return {
                word_count_distribution: Object.entries(wordCountRanges).map(([range, count]) => ({
                    range,
                    count,
                    percentage: articles.length > 0 ? Math.round((count / articles.length) * 100) : 0
                })),
                reading_time_distribution: Object.entries(readingTimeRanges).map(([range, count]) => ({
                    range,
                    count,
                    percentage: articles.length > 0 ? Math.round((count / articles.length) * 100) : 0
                })),
                total_analyzed: articles.length
            };
        } catch (error) {
            throw new Error(`Failed to get content analysis: ${error.message}`);
        }
    }

    getHighlightAnalysis() {
        try {
            const articles = this.db.getAllArticles();
            let totalHighlights = 0;
            let highlightLengths = [];
            let articlesWithHighlights = 0;

            articles.forEach(article => {
                const highlights = this.db.getArticleHighlights(article.id);
                if (highlights.length > 0) {
                    articlesWithHighlights++;
                    totalHighlights += highlights.length;
                    highlights.forEach(h => {
                        highlightLengths.push(h.text.length);
                    });
                }
            });

            const avgHighlightsPerArticle = articlesWithHighlights > 0 
                ? Math.round(totalHighlights / articlesWithHighlights * 10) / 10 
                : 0;

            const avgHighlightLength = highlightLengths.length > 0 
                ? Math.round(highlightLengths.reduce((sum, len) => sum + len, 0) / highlightLengths.length)
                : 0;

            return {
                total_highlights: totalHighlights,
                articles_with_highlights: articlesWithHighlights,
                highlight_rate: articles.length > 0 ? Math.round((articlesWithHighlights / articles.length) * 100) : 0,
                avg_highlights_per_article: avgHighlightsPerArticle,
                avg_highlight_length: avgHighlightLength
            };
        } catch (error) {
            throw new Error(`Failed to get highlight analysis: ${error.message}`);
        }
    }

    generateReport(type = 'comprehensive') {
        try {
            const report = {
                generated_at: new Date().toISOString(),
                type: type,
                overall_stats: this.getOverallStats()
            };

            if (type === 'comprehensive' || type === 'detailed') {
                report.reading_trends = this.getReadingTrends();
                report.top_domains = this.getTopDomains();
                report.top_tags = this.getTopTags();
                report.reading_patterns = this.getReadingPatterns();
                report.productivity_metrics = this.getProductivityMetrics();
                report.content_analysis = this.getContentAnalysis();
                report.highlight_analysis = this.getHighlightAnalysis();
            }

            return report;
        } catch (error) {
            throw new Error(`Failed to generate report: ${error.message}`);
        }
    }

    parseArticleTags(article) {
        try {
            if (Array.isArray(article.tags)) return article.tags;
            return JSON.parse(article.tags || '[]');
        } catch {
            return [];
        }
    }
}

module.exports = AnalyticsService;