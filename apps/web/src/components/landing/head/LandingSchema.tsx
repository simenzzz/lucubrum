/**
 * JSON-LD structured data for the landing page
 * Provides SEO benefits and rich snippets
 */
import { useEffect } from 'react';

interface LandingSchemaProps {
  topic?: string;
}

export function LandingSchema({ topic }: LandingSchemaProps) {
  useEffect(() => {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Lucubrum',
      description:
        'AI-powered personalized learning roadmaps with curated resources, adaptive exercises, and mastery tracking. Chart your course to knowledge.',
      url: 'https://learninghelper.app',
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      featureList: [
        'Personalized Learning Roadmaps',
        'AI-Generated Curriculum',
        'YouTube Resource Integration',
        'Adaptive Exercises',
        'Spaced Repetition',
        'Mastery Tracking',
        'Progress Analytics',
      ],
      author: {
        '@type': 'Organization',
        name: 'Lucubrum',
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.8',
        ratingCount: '150',
      },
    };

    const breadcrumbSchema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: 'https://learninghelper.app',
        },
      ],
    };

    // Add JSON-LD to document head
    const schemaScript = document.createElement('script');
    schemaScript.type = 'application/ld+json';
    schemaScript.text = JSON.stringify(schema);
    document.head.appendChild(schemaScript);

    const breadcrumbScript = document.createElement('script');
    breadcrumbScript.type = 'application/ld+json';
    breadcrumbScript.text = JSON.stringify(breadcrumbSchema);
    document.head.appendChild(breadcrumbScript);

    // Set meta tags
    document.title = 'Lucubrum - Chart Your Course';

    const metaTags = [
      { name: 'application-name', content: 'Lucubrum' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      { name: 'apple-mobile-web-app-title', content: 'Lucubrum' },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: 'Lucubrum - Chart Your Course' },
      { property: 'og:description', content: 'AI-powered personalized learning roadmaps with curated resources, adaptive exercises, and mastery tracking.' },
      { property: 'og:url', content: 'https://learninghelper.app' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'Lucubrum - Chart Your Course' },
      { name: 'twitter:description', content: 'AI-powered personalized learning roadmaps with curated resources, adaptive exercises, and mastery tracking.' },
    ];

    metaTags.forEach(({ name, property, content }) => {
      const meta = document.createElement('meta');
      if (name) meta.setAttribute('name', name);
      if (property) meta.setAttribute('property', property);
      meta.setAttribute('content', content || '');
      document.head.appendChild(meta);
    });

    return () => {
      // Cleanup scripts and meta tags on unmount
      document.head.removeChild(schemaScript);
      document.head.removeChild(breadcrumbScript);
    };
  }, [topic]);

  return null;
}
