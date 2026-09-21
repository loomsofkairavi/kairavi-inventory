// Pure, DOM-free and Firebase-free logic shared by app.js and test.html.
// Nothing in this file touches the network, the DOM, or Firebase, so it
// can be loaded and exercised on its own (see test.html).
(function (root) {
  "use strict";

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function colorCode(color) {
    return String(color || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function costCode(cost) {
    cost = Math.max(0, Math.round(Number(cost) || 0));
    var hundreds = Math.floor(cost / 100);
    var rem = cost % 100;
    return hundreds + 'C' + String(rem).padStart(2, '0');
  }

  function baseProductId(color, typeCode, cost) {
    return 'LOK-' + colorCode(color) + '-' + (typeCode || '?').toUpperCase() + '-' + costCode(cost);
  }

  function labelForEmail(email) {
    if (!email) return '';
    var name = email.split('@')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function statusChipLabel(v) {
    return v === 'available' ? 'Available' : v === 'sold' ? 'Sold' : 'Full';
  }

  // statusFilterVal: 'all' | 'available' | 'sold'; searchVal: lowercase search term.
  function matchesFilters(r, statusFilterVal, searchVal) {
    if (statusFilterVal && statusFilterVal !== 'all' && r.status !== statusFilterVal) return false;
    if (!searchVal) return true;
    var hay = [r.productId, r.color, r.typeName].join(' ').toLowerCase();
    return hay.indexOf(searchVal) !== -1;
  }

  function computeDashboardStats(sarees) {
    var total = sarees.length;
    var available = sarees.filter(function (r) { return r.status !== 'sold'; });
    var sold = sarees.filter(function (r) { return r.status === 'sold'; });
    var availValue = available.reduce(function (s, r) { return s + (Number(r.landingCost) || 0); }, 0);
    var soldRevenue = sold.reduce(function (s, r) { return s + (Number(r.soldPrice) || 0); }, 0);
    var soldCost = sold.reduce(function (s, r) { return s + (Number(r.landingCost) || 0); }, 0);
    return {
      total: total,
      availableCount: available.length,
      soldCount: sold.length,
      availValue: availValue,
      soldRevenue: soldRevenue,
      soldCost: soldCost,
      grossProfit: soldRevenue - soldCost
    };
  }

  function computeTypeCounts(sarees) {
    var counts = {};
    sarees.forEach(function (r) {
      var key = r.typeName || 'Other';
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }

  var KairaviLogic = {
    escapeHtml: escapeHtml,
    colorCode: colorCode,
    costCode: costCode,
    baseProductId: baseProductId,
    labelForEmail: labelForEmail,
    statusChipLabel: statusChipLabel,
    matchesFilters: matchesFilters,
    computeDashboardStats: computeDashboardStats,
    computeTypeCounts: computeTypeCounts
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = KairaviLogic;
  } else {
    root.KairaviLogic = KairaviLogic;
  }
})(typeof window !== 'undefined' ? window : this);
