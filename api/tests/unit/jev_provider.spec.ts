import { test } from '@japa/runner'
import { isJevConfigured, resolveJevProvider } from '../../app/utils/jev_provider.js'

test.group('jev_provider | resolveJevProvider', () => {
  test('defaults to the official TypeSafe API when JEV_PROVIDER is unset or unknown', ({
    assert,
  }) => {
    for (const env of [{}, { JEV_PROVIDER: '' }, { JEV_PROVIDER: 'huggingface' }]) {
      const p = resolveJevProvider({ ...env, TYPESAFE_API_KEY: 'ts-key' })
      assert.equal(p.name, 'typesafe')
      assert.equal(p.url, 'https://api.typesafe.ai/v1/systemone')
      assert.equal(p.apiKey, 'ts-key')
      assert.equal(p.modelId('jev-latest'), 'jev-latest')
      assert.deepEqual(p.headers, {})
    }
  })

  test('openrouter points at its systemone endpoint, prefixes the model and uses its own key', ({
    assert,
  }) => {
    const p = resolveJevProvider({
      JEV_PROVIDER: 'OpenRouter',
      OPENROUTER_API_KEY: 'or-key',
      TYPESAFE_API_KEY: 'ts-key',
    })

    assert.equal(p.name, 'openrouter')
    assert.equal(p.url, 'https://openrouter.ai/api/v1/systemone')
    assert.equal(p.apiKey, 'or-key')
    assert.equal(p.modelId('jev-latest'), '~typesafe/jev-latest')
    assert.equal(p.modelId('jev-1.13'), 'typesafe/jev-1.13')
    assert.equal(p.modelId('typesafe/jev-1.13'), 'typesafe/jev-1.13')
    assert.property(p.headers, 'HTTP-Referer')
  })

  test('JEV_MODEL pins a concrete id on any provider, ignoring the logical model', ({ assert }) => {
    const or = resolveJevProvider({
      JEV_PROVIDER: 'openrouter',
      OPENROUTER_API_KEY: 'k',
      JEV_MODEL: 'typesafe/jev-1.13',
    })
    assert.equal(or.modelId('jev-latest'), 'typesafe/jev-1.13')

    const ts = resolveJevProvider({ TYPESAFE_API_KEY: 'k', JEV_MODEL: 'jev-1.13.0' })
    assert.equal(ts.modelId('jev-latest'), 'jev-1.13.0')

    const blank = resolveJevProvider({ TYPESAFE_API_KEY: 'k', JEV_MODEL: '  ' })
    assert.equal(blank.modelId('jev-latest'), 'jev-latest')
  })

  test('each provider reads only its own key, so switching back never borrows the other', ({
    assert,
  }) => {
    assert.isNull(resolveJevProvider({ JEV_PROVIDER: 'openrouter', TYPESAFE_API_KEY: 'x' }).apiKey)
    assert.isNull(resolveJevProvider({ JEV_PROVIDER: 'typesafe', OPENROUTER_API_KEY: 'x' }).apiKey)
  })

  test('blank keys count as unset', ({ assert }) => {
    assert.isFalse(isJevConfigured({ JEV_PROVIDER: 'openrouter', OPENROUTER_API_KEY: '   ' }))
    assert.isFalse(isJevConfigured({ TYPESAFE_API_KEY: '' }))
    assert.isTrue(isJevConfigured({ JEV_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'k' }))
    assert.isTrue(isJevConfigured({ TYPESAFE_API_KEY: 'k' }))
  })
})
