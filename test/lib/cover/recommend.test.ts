import {expect} from 'chai'

import {pickBestPixabayHit} from '../../../src/lib/cover/recommend.js'

describe('cover recommendation', () => {
  it('prefers the strongest matching horizontal pixabay hit', () => {
    const result = pickBestPixabayHit(
      [
        {
          downloads: 320,
          id: 1,
          imageHeight: 1200,
          imageWidth: 800,
          largeImageURL: 'https://example.com/1-large.jpg',
          likes: 100,
          pageURL: 'https://example.com/1',
          previewURL: 'https://example.com/1-preview.jpg',
          tags: 'vertical sample',
          type: 'photo',
          user: 'alice',
          webformatURL: 'https://example.com/1-web.jpg',
        },
        {
          downloads: 840,
          id: 2,
          imageHeight: 720,
          imageWidth: 1280,
          largeImageURL: 'https://example.com/2-large.jpg',
          likes: 240,
          pageURL: 'https://example.com/2',
          previewURL: 'https://example.com/2-preview.jpg',
          tags: 'horizontal sample',
          type: 'photo',
          user: 'bob',
          webformatURL: 'https://example.com/2-web.jpg',
        },
      ],
      'horizontal',
    )

    expect(result?.id).to.equal(2)
  })
})
