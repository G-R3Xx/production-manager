(function () {
  'use strict';
  var config = window.TEAccountPricing || {};
  if (!config.enabled || !config.ajaxUrl || !config.nonce || typeof window.fetch !== 'function') return;

  var nativeFetch = window.fetch.bind(window);
  var directPricePattern = /\/api\/wordpress\/direct-price(?:\?|$)/i;

  function requestUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    return '';
  }

  window.fetch = function (input, init) {
    var url = requestUrl(input);
    if (!directPricePattern.test(url)) return nativeFetch(input, init);

    var options = init || {};
    var payload = {};
    try {
      payload = options.body ? JSON.parse(String(options.body)) : {};
    } catch (error) {
      return nativeFetch(input, init);
    }

    var form = new FormData();
    form.append('action', 'te_account_pricing_proxy');
    form.append('_ajax_nonce', config.nonce);
    form.append('payload', JSON.stringify(payload));

    return nativeFetch(config.ajaxUrl, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      body: form
    }).then(function (response) {
      return response.text().then(function (text) {
        var headers = new Headers();
        headers.set('Content-Type', 'application/json');
        headers.set('Cache-Control', 'no-store');
        return new Response(text, {
          status: response.status,
          statusText: response.statusText,
          headers: headers
        });
      });
    });
  };
})();
