const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const https = require('node:https');
const test = require('node:test');

const {
  createPinnedLookup,
  fetchExternalHtml,
  requestHtml,
} = require('../src/importArticle');

const PUBLIC_IPV4 = { address: '93.184.216.34', family: 4 };

test('pinned lookup supports standard and all-address Node callback contracts', async () => {
  const lookup = createPinnedLookup(PUBLIC_IPV4);

  await new Promise((resolve, reject) => {
    lookup('example.com', { family: 4 }, (error, address, family) => {
      try {
        assert.ifError(error);
        assert.equal(address, PUBLIC_IPV4.address);
        assert.equal(family, 4);
        resolve();
      } catch (testError) {
        reject(testError);
      }
    });
  });

  await new Promise((resolve, reject) => {
    lookup('example.com', { all: true }, (error, records) => {
      try {
        assert.ifError(error);
        assert.deepEqual(records, [PUBLIC_IPV4]);
        resolve();
      } catch (testError) {
        reject(testError);
      }
    });
  });
});

test('HTTPS request pins the verified address and disables address auto-selection', async () => {
  const originalRequest = https.request;
  let capturedOptions;

  https.request = (_url, options, onResponse) => {
    capturedOptions = options;
    const request = new EventEmitter();
    request.destroy = () => {};
    request.end = () => {
      process.nextTick(() => {
        options.lookup('example.com', { family: 4 }, (error, address, family) => {
          assert.ifError(error);
          assert.equal(address, PUBLIC_IPV4.address);
          assert.equal(family, 4);
        });
        const response = new EventEmitter();
        response.statusCode = 200;
        response.headers = { 'content-type': 'text/html' };
        onResponse(response);
        response.emit('data', Buffer.from('<main>Safe HTML</main>'));
        response.emit('end');
      });
    };
    return request;
  };

  try {
    const response = await requestHtml(new URL('https://example.com/'), PUBLIC_IPV4);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body, '<main>Safe HTML</main>');
    assert.equal(capturedOptions.autoSelectFamily, false);
  } finally {
    https.request = originalRequest;
  }
});

test('fetches a valid HTTPS HTML response through verified mock DNS and request layers', async () => {
  const result = await fetchExternalHtml('https://example.com/news', {
    resolver: async (hostname) => {
      assert.equal(hostname, 'example.com');
      return PUBLIC_IPV4;
    },
    requester: async (url, address) => {
      assert.equal(url.href, 'https://example.com/news');
      assert.deepEqual(address, PUBLIC_IPV4);
      return {
        statusCode: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: '<title>Safe title</title><main>Safe content</main>',
      };
    },
  });

  assert.equal(result.url, 'https://example.com/news');
  assert.match(result.html, /Safe content/);
});

test('blocks private IPv4 and IPv6 URLs before DNS or HTTP requests', async () => {
  for (const url of ['https://127.0.0.1/', 'https://10.0.0.1/', 'https://[::1]/', 'https://[fd00::1]/']) {
    let resolverCalled = false;
    await assert.rejects(
      () => fetchExternalHtml(url, {
        resolver: async () => {
          resolverCalled = true;
          return PUBLIC_IPV4;
        },
        requester: async () => {
          throw new Error('must not request');
        },
      }),
      /blocked_url/
    );
    assert.equal(resolverCalled, false, `${url} must not resolve`);
  }
});

test('blocks a redirect to a private address before the second request', async () => {
  let requestCount = 0;
  await assert.rejects(
    () => fetchExternalHtml('https://public.example/article', {
      resolver: async (hostname) => {
        assert.equal(hostname, 'public.example');
        return PUBLIC_IPV4;
      },
      requester: async () => {
        requestCount += 1;
        return {
          statusCode: 302,
          headers: { location: 'https://127.0.0.1/private' },
          body: '',
        };
      },
    }),
    /blocked_url/
  );
  assert.equal(requestCount, 1);
});
