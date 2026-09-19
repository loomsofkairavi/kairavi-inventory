(function(){
  "use strict";

  // =========================================================================
  // SETUP: paste the config from your Firebase project (Project settings ->
  // General -> Your apps -> Web app) below. See the setup notes delivered
  // alongside this file for the full click-by-click walkthrough.
  // =========================================================================
  var firebaseConfig = {
    apiKey: "AIzaSyBHd3AhUn4u_hCLTJByECVNve0utEBOu8I",
    authDomain: "kairavi-inventory.firebaseapp.com",
    projectId: "kairavi-inventory",
    storageBucket: "kairavi-inventory.firebasestorage.app",
    messagingSenderId: "65529565646",
    appId: "1:65529565646:web:522b062c8eb334446ddb9f"
  };
  var CONFIGURED = firebaseConfig.apiKey !== "REPLACE_ME";

  // Photos are uploaded to Firebase Storage at full resolution (no
  // client-side compression) — only a sane upper bound to avoid an
  // accidental multi-hundred-MB upload from a phone.
  var MAX_PHOTO_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

  var sarees = [];
  var currentPhotoFile = null;
  var html5QrInstance = null;
  var auth = null, db = null, storage = null;

  function $(sel, root){ return (root||document).querySelector(sel); }
  function $all(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }

  function showToast(msg){
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function(){ t.classList.remove('show'); }, 3200);
  }

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  // ---------- product id ----------
  function colorCode(color){
    return String(color || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function costCode(cost){
    cost = Math.max(0, Math.round(Number(cost) || 0));
    var hundreds = Math.floor(cost / 100);
    var rem = cost % 100;
    return hundreds + 'C' + String(rem).padStart(2, '0');
  }
  function baseProductId(color, typeCode, cost){
    return 'LOK-' + colorCode(color) + '-' + (typeCode || '?').toUpperCase() + '-' + costCode(cost);
  }
  async function allocateProductId(base){
    var n = 1;
    while (n <= 99){
      var candidate = n === 1 ? base : (base + '-' + String(n).padStart(2, '0'));
      try{
        var snap = await db.collection('sarees').doc(candidate).get();
        if (!snap.exists) return candidate;
      }catch(e){ return candidate; }
      n++;
    }
    return base + '-' + Date.now().toString(36).toUpperCase();
  }

  function labelForEmail(email){
    if (!email) return '';
    var name = email.split('@')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  function currentUser(){
    return auth && auth.currentUser ? labelForEmail(auth.currentUser.email) : '';
  }

  // ---------- auth ----------
  function initAuth(){
    if (!CONFIGURED){
      $('#setupNote').hidden = false;
      $('#loginForm').hidden = true;
      $('#forgotBtn').hidden = true;
      return;
    }
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    storage = firebase.storage();

    auth.onAuthStateChanged(function(user){
      if (user){
        $('#authGate').hidden = true;
        $('#appRoot').hidden = false;
        $('#userLabel').textContent = labelForEmail(user.email);
        subscribeCatalog();
      } else {
        $('#appRoot').hidden = true;
        $('#authGate').hidden = false;
        sarees = [];
      }
    });

    $('#loginForm').addEventListener('submit', function(e){
      e.preventDefault();
      var email = $('#loginEmail').value.trim();
      var pw = $('#loginPassword').value;
      var errEl = $('#authError');
      errEl.hidden = true;
      var btn = $('#loginBtn');
      btn.disabled = true; btn.textContent = 'Signing in…';
      auth.signInWithEmailAndPassword(email, pw).catch(function(err){
        errEl.textContent = err.message || 'Could not sign in.';
        errEl.hidden = false;
      }).finally(function(){
        btn.disabled = false; btn.textContent = 'Sign in';
      });
    });

    $('#forgotBtn').addEventListener('click', function(){
      var email = $('#loginEmail').value.trim();
      if (!email){ showToast('Type your email above first, then tap this again.'); return; }
      auth.sendPasswordResetEmail(email).then(function(){
        showToast('Password reset email sent to ' + email);
      }).catch(function(err){
        showToast(err.message || 'Could not send reset email.');
      });
    });

    $('#signOutBtn').addEventListener('click', function(){
      auth.signOut();
    });
  }

  var unsubscribeCatalog = null;
  function subscribeCatalog(){
    if (unsubscribeCatalog) unsubscribeCatalog();
    unsubscribeCatalog = db.collection('sarees').onSnapshot(function(qs){
      sarees = qs.docs.map(function(d){ return Object.assign({id: d.id}, d.data()); });
      renderCatalog();
      renderDashboard();
    }, function(err){
      showToast('Could not load inventory (' + err.code + ')');
    });
  }

  // ---------- QR rendering ----------
  function renderQrInto(container, text, size){
    container.innerHTML = '';
    if (typeof QRCode === 'undefined'){
      container.textContent = 'QR unavailable';
      return Promise.resolve(null);
    }
    return new Promise(function(resolve){
      new QRCode(container, {text: text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M});
      setTimeout(function(){
        var canvas = container.querySelector('canvas');
        if (canvas){ resolve(canvas); return; }
        var img = container.querySelector('img');
        if (img){
          var c = document.createElement('canvas');
          c.width = size; c.height = size;
          var ctx = c.getContext('2d');
          var im = new Image();
          im.onload = function(){ ctx.drawImage(im, 0, 0, size, size); resolve(c); };
          im.onerror = function(){ resolve(null); };
          im.src = img.src;
        } else resolve(null);
      }, 60);
    });
  }

  async function buildTagCanvas(record){
    var W = 480, H = 620;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fffaf2';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#a97a24';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, W - 20, H - 20);

    ctx.fillStyle = '#7c1f2b';
    ctx.font = 'italic 600 26px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('Looms of Kairavi', W / 2, 52);

    var tmp = document.createElement('div');
    var qrCanvas = await renderQrInto(tmp, record.productId, 260);
    if (qrCanvas){
      ctx.drawImage(qrCanvas, (W - 260) / 2, 74, 260, 260);
    }

    ctx.fillStyle = '#2a1912';
    ctx.font = '600 26px "Courier New", monospace';
    ctx.fillText(record.productId, W / 2, 372);

    ctx.font = '17px Georgia, serif';
    ctx.fillStyle = '#4a3a2c';
    var typeLabel = (record.typeName || '') + (record.color ? ' · ' + record.color : '');
    ctx.fillText(typeLabel, W / 2, 402);
    ctx.fillText('Landing cost: $' + Math.round(record.landingCost || 0), W / 2, 428);

    ctx.font = '13px Georgia, serif';
    ctx.fillStyle = '#8a7a68';
    ctx.fillText('@loomsofkairavi', W / 2, H - 26);
    return canvas;
  }

  async function printTag(record){
    var host = $('#printTag');
    host.innerHTML = '<div style="font-family:Georgia,serif; font-style:italic; font-weight:600; font-size:1.1rem; color:#7c1f2b;">Looms of Kairavi</div>';
    var qrHolder = document.createElement('div');
    host.appendChild(qrHolder);
    await renderQrInto(qrHolder, record.productId, 180);
    var pid = document.createElement('div');
    pid.style.cssText = 'font-family:monospace; font-weight:600; font-size:1rem;';
    pid.textContent = record.productId;
    host.appendChild(pid);
    var meta = document.createElement('div');
    meta.style.cssText = 'font-size:0.8rem; text-align:center;';
    meta.textContent = (record.typeName || '') + ' · ' + (record.color || '') + ' · $' + Math.round(record.landingCost || 0);
    host.appendChild(meta);
    window.print();
  }

  // generic "save bytes as a file" helper — plain browser download,
  // no host capability needed outside a Claude artifact.
  function downloadBlob(filename, blob){
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }

  async function downloadTag(record){
    var canvas = await buildTagCanvas(record);
    canvas.toBlob(function(blob){
      if (!blob){ showToast('Could not build the tag image.'); return; }
      downloadBlob(record.productId + '.png', blob);
    }, 'image/png');
  }

  // ---------- add form ----------
  function currentTypeSelection(){
    var sel = $('#f-type').value;
    if (sel === '__other__'){
      return {
        name: $('#f-type-name').value.trim() || 'Other',
        code: ($('#f-type-code').value.trim() || 'X').toUpperCase().slice(0, 1)
      };
    }
    var parts = sel.split('|');
    return {name: parts[0], code: parts[1]};
  }

  async function updatePreview(){
    var color = $('#f-color').value;
    var cost = $('#f-cost').value;
    var t = currentTypeSelection();
    var base = baseProductId(color, t.code, cost);
    $('#previewPid').textContent = base;
    await renderQrInto($('#previewQrBox'), base, 108);
  }

  $('#f-type').addEventListener('change', function(){
    $('#otherTypeRow').hidden = this.value !== '__other__';
    updatePreview();
  });
  ['input'].forEach(function(evt){
    $('#f-color').addEventListener(evt, updatePreview);
    $('#f-cost').addEventListener(evt, updatePreview);
    $('#f-type-name').addEventListener(evt, updatePreview);
    $('#f-type-code').addEventListener(evt, updatePreview);
  });

  $('#f-photo').addEventListener('change', function(e){
    var file = e.target.files && e.target.files[0];
    currentPhotoFile = file || null;
    var thumb = $('#photoThumb');
    if (file){
      var reader = new FileReader();
      reader.onload = function(ev){ thumb.src = ev.target.result; };
      reader.readAsDataURL(file);
    } else {
      thumb.src = '';
    }
  });

  // Uploads the photo to Firebase Storage at full resolution — no resize,
  // no recompression — and resolves { url, path } for the Firestore record.
  function uploadPhoto(file, productId){
    return new Promise(function(resolve, reject){
      if (file.size > MAX_PHOTO_UPLOAD_BYTES){
        reject(new Error('too_large'));
        return;
      }
      var ext = 'jpg';
      if (file.name && file.name.indexOf('.') !== -1){
        ext = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      }
      var path = 'saree-photos/' + productId + '-' + Date.now() + '.' + ext;
      var ref = storage.ref(path);
      ref.put(file, { contentType: file.type || 'image/jpeg' }).then(function(snapshot){
        return snapshot.ref.getDownloadURL();
      }).then(function(url){
        resolve({ url: url, path: path });
      }).catch(reject);
    });
  }

  $('#addForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var color = $('#f-color').value.trim();
    var cost = Number($('#f-cost').value);
    var t = currentTypeSelection();
    if (!color || !cost){ showToast('Add a colour and landing cost first.'); return; }

    var btn = $('#submitBtn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try{
      var base = baseProductId(color, t.code, cost);
      var productId = await allocateProductId(base);

      var photoUrl = null, photoPath = null;
      if (currentPhotoFile){
        try{
          var uploaded = await uploadPhoto(currentPhotoFile, productId);
          photoUrl = uploaded.url;
          photoPath = uploaded.path;
        }catch(err){
          if (err && err.message === 'too_large'){
            showToast('Photo is over 20MB — saved without photo.');
          } else {
            showToast('Photo could not be uploaded — saved without photo.');
          }
        }
      }

      await db.collection('sarees').doc(productId).set({
        productId: productId,
        color: color,
        typeName: t.name,
        typeCode: t.code,
        landingCost: cost,
        photoUrl: photoUrl,
        photoPath: photoPath,
        status: 'available',
        notes: $('#f-notes').value.trim(),
        addedBy: currentUser(),
        createdAt: Date.now()
      });

      showToast('Saved ' + productId);
      $('#addForm').reset();
      currentPhotoFile = null;
      $('#photoThumb').src = '';
      $('#otherTypeRow').hidden = true;
      updatePreview();
      openDetail(productId, true);
    }catch(err){
      showToast('Could not save (' + (err && err.code || 'error') + ')');
    }finally{
      btn.disabled = false; btn.textContent = 'Add to inventory';
    }
  });

  // ---------- catalog ----------
  var statusFilterVal = 'all';
  var searchVal = '';

  $('#statusFilter').addEventListener('click', function(e){
    var chip = e.target.closest('.chip');
    if (!chip) return;
    $all('.chip', this).forEach(function(c){ c.classList.remove('active'); });
    chip.classList.add('active');
    statusFilterVal = chip.dataset.status;
    renderCatalog();
  });
  $('#searchBox').addEventListener('input', function(){
    searchVal = this.value.trim().toLowerCase();
    renderCatalog();
  });

  function matchesFilters(r){
    if (statusFilterVal !== 'all' && r.status !== statusFilterVal) return false;
    if (!searchVal) return true;
    var hay = [r.productId, r.color, r.typeName].join(' ').toLowerCase();
    return hay.indexOf(searchVal) !== -1;
  }

  function renderCatalog(){
    var grid = $('#catalogGrid');
    var list = sarees.filter(matchesFilters).sort(function(a, b){ return (b.createdAt || 0) - (a.createdAt || 0); });
    grid.innerHTML = '';
    $('#catalogEmpty').hidden = list.length !== 0;
    list.forEach(function(r){
      var card = document.createElement('div');
      card.className = 'card';
      card.dataset.id = r.productId;
      var photoHtml = r.photoUrl
        ? '<img class="photo" src="' + r.photoUrl + '" alt="' + escapeHtml(r.color) + ' ' + escapeHtml(r.typeName) + '" />'
        : '<div class="swatch">' + escapeHtml(r.color || 'No photo') + '</div>';
      card.innerHTML =
        photoHtml +
        '<div class="body">' +
          '<span class="pill ' + (r.status === 'sold' ? 'sold' : 'available') + '">' + (r.status === 'sold' ? 'Sold' : 'Available') + '</span>' +
          '<div class="pid">' + escapeHtml(r.productId) + '</div>' +
          '<div class="desc">' + escapeHtml(r.typeName) + ' &middot; $' + Math.round(r.landingCost || 0) + '</div>' +
        '</div>';
      card.addEventListener('click', function(){ openDetail(r.productId); });
      grid.appendChild(card);
    });
  }

  // ---------- detail modal ----------
  function findRecord(id){
    return sarees.filter(function(r){ return r.productId === id; })[0];
  }

  async function openDetail(id, justAdded){
    var r = findRecord(id);
    if (!r){ showToast('Could not find ' + id); return; }
    var body = $('#modalBody');
    var photoHtml = r.photoUrl ? '<img class="modal-photo" src="' + r.photoUrl + '" alt="" />' : '';
    body.innerHTML =
      '<button class="modal-close" id="closeModalBtn" aria-label="Close">&times;</button>' +
      (justAdded ? '<p class="hint" style="color:var(--ok); margin:0 0 8px;">Added to inventory.</p>' : '') +
      photoHtml +
      '<div class="modal-pid">' + escapeHtml(r.productId) + '</div>' +
      '<span class="pill ' + (r.status === 'sold' ? 'sold' : 'available') + '" style="margin-top:6px;">' + (r.status === 'sold' ? 'Sold' : 'Available') + '</span>' +
      '<dl class="kv">' +
        '<dt>Colour</dt><dd>' + escapeHtml(r.color) + '</dd>' +
        '<dt>Weave</dt><dd>' + escapeHtml(r.typeName) + ' (' + escapeHtml(r.typeCode) + ')</dd>' +
        '<dt>Landing cost</dt><dd>$' + Math.round(r.landingCost || 0) + '</dd>' +
        (r.notes ? '<dt>Notes</dt><dd>' + escapeHtml(r.notes) + '</dd>' : '') +
        (r.addedBy ? '<dt>Added by</dt><dd>' + escapeHtml(r.addedBy) + '</dd>' : '') +
        (r.status === 'sold' ? '<dt>Sold price</dt><dd>$' + Math.round(r.soldPrice || 0) + '</dd>' : '') +
        (r.status === 'sold' && r.soldTo ? '<dt>Sold to</dt><dd>' + escapeHtml(r.soldTo) + '</dd>' : '') +
        (r.status === 'sold' && r.soldBy ? '<dt>Sold by</dt><dd>' + escapeHtml(r.soldBy) + '</dd>' : '') +
      '</dl>' +
      '<div class="btn-row">' +
        '<button class="btn secondary" id="printTagBtn" type="button">Print tag</button>' +
        '<button class="btn ghost" id="downloadTagBtn" type="button">Download tag PNG</button>' +
      '</div>' +
      (r.status === 'available'
        ? '<div class="sold-form"><div class="row2">' +
            '<div class="field"><label for="soldPriceInput">Sold price ($)</label><input type="number" id="soldPriceInput" placeholder="' + Math.round((r.landingCost || 0) * 1.6) + '"></div>' +
            '<div class="field"><label for="soldToInput">Sold to (optional)</label><input type="text" id="soldToInput" placeholder="Customer name"></div>' +
          '</div><div class="btn-row"><button class="btn" id="markSoldBtn" type="button">Mark as sold</button></div></div>'
        : '<div class="sold-form"><button class="btn secondary" id="markAvailableBtn" type="button">Mark as available again</button></div>') +
      '<div class="btn-row" style="margin-top:14px; border-top:1px solid var(--line); padding-top:14px;">' +
        '<button class="btn danger" id="deleteBtn" type="button">Delete record</button>' +
      '</div>';

    $('#modalBackdrop').classList.add('show');
    $('#closeModalBtn').addEventListener('click', closeModal);
    $('#printTagBtn').addEventListener('click', function(){ printTag(r); });
    $('#downloadTagBtn').addEventListener('click', function(){ downloadTag(r); });

    var markSoldBtn = $('#markSoldBtn');
    if (markSoldBtn){
      markSoldBtn.addEventListener('click', async function(){
        var price = Number($('#soldPriceInput').value) || 0;
        var to = $('#soldToInput').value.trim();
        try{
          await db.collection('sarees').doc(r.productId).update({
            status: 'sold', soldPrice: price, soldTo: to,
            soldAt: Date.now(), soldBy: currentUser()
          });
          showToast(r.productId + ' marked sold');
          closeModal();
        }catch(err){ showToast('Could not update (' + (err && err.code) + ')'); }
      });
    }
    var markAvailableBtn = $('#markAvailableBtn');
    if (markAvailableBtn){
      markAvailableBtn.addEventListener('click', async function(){
        try{
          await db.collection('sarees').doc(r.productId).update({status: 'available', soldPrice: null, soldTo: null, soldAt: null, soldBy: null});
          showToast(r.productId + ' marked available');
          closeModal();
        }catch(err){ showToast('Could not update (' + (err && err.code) + ')'); }
      });
    }
    $('#deleteBtn').addEventListener('click', async function(){
      if (!confirm('Delete ' + r.productId + '? This cannot be undone.')) return;
      try{
        await db.collection('sarees').doc(r.productId).delete();
        if (r.photoPath){ storage.ref(r.photoPath).delete().catch(function(){}); }
        showToast('Deleted ' + r.productId);
        closeModal();
      }catch(err){ showToast('Could not delete (' + (err && err.code) + ')'); }
    });
  }

  function closeModal(){ $('#modalBackdrop').classList.remove('show'); }
  $('#modalBackdrop').addEventListener('click', function(e){ if (e.target === this) closeModal(); });

  // ---------- scan ----------
  $('#startScanBtn').addEventListener('click', function(){
    if (typeof Html5Qrcode === 'undefined'){ showToast('Camera scanning is unavailable here — type the ID instead.'); return; }
    $('#startScanBtn').hidden = true;
    $('#stopScanBtn').hidden = false;
    html5QrInstance = new Html5Qrcode('qr-reader');
    html5QrInstance.start(
      {facingMode: 'environment'},
      {fps: 10, qrbox: 220},
      function(decoded){ handleScanResult(decoded); },
      function(){ /* per-frame no-decode, ignore */ }
    ).catch(function(err){
      showToast('Could not start camera — check permissions.');
      $('#startScanBtn').hidden = false;
      $('#stopScanBtn').hidden = true;
    });
  });
  $('#stopScanBtn').addEventListener('click', stopScanner);
  function stopScanner(){
    if (html5QrInstance){
      html5QrInstance.stop().then(function(){ html5QrInstance.clear(); }).catch(function(){});
    }
    $('#startScanBtn').hidden = false;
    $('#stopScanBtn').hidden = true;
  }
  $('#manualId').addEventListener('keydown', function(e){
    if (e.key === 'Enter'){ handleScanResult(this.value.trim()); }
  });

  function handleScanResult(id){
    var r = findRecord(id);
    var box = $('#scanResult');
    box.classList.add('show');
    if (!r){
      box.innerHTML = '<strong>' + escapeHtml(id) + '</strong> was not found in the catalog.';
      return;
    }
    box.innerHTML =
      '<div class="modal-pid" style="font-size:1rem;">' + escapeHtml(r.productId) + '</div>' +
      '<div class="desc" style="margin:4px 0 10px;">' + escapeHtml(r.typeName) + ' &middot; ' + escapeHtml(r.color) + ' &middot; $' + Math.round(r.landingCost) + '</div>' +
      '<span class="pill ' + (r.status === 'sold' ? 'sold' : 'available') + '">' + (r.status === 'sold' ? 'Sold' : 'Available') + '</span>' +
      '<div class="btn-row" style="margin-top:10px;"><button class="btn secondary" id="scanOpenBtn" type="button">Open record</button></div>';
    $('#scanOpenBtn').addEventListener('click', function(){ openDetail(r.productId); });
  }

  // ---------- dashboard ----------
  function renderDashboard(){
    var total = sarees.length;
    var available = sarees.filter(function(r){ return r.status !== 'sold'; });
    var sold = sarees.filter(function(r){ return r.status === 'sold'; });
    var availValue = available.reduce(function(s, r){ return s + (Number(r.landingCost) || 0); }, 0);
    var soldRevenue = sold.reduce(function(s, r){ return s + (Number(r.soldPrice) || 0); }, 0);
    var soldCost = sold.reduce(function(s, r){ return s + (Number(r.landingCost) || 0); }, 0);

    $('#statTiles').innerHTML = [
      tile('Total pieces', total),
      tile('Available', available.length),
      tile('Sold', sold.length),
      tile('Available inventory value', '$' + availValue.toLocaleString(), true),
      tile('Sold revenue', '$' + soldRevenue.toLocaleString(), true),
      tile('Gross profit on sold', '$' + (soldRevenue - soldCost).toLocaleString(), true)
    ].join('');

    var counts = {};
    sarees.forEach(function(r){
      var key = r.typeName || 'Other';
      counts[key] = (counts[key] || 0) + 1;
    });
    var maxCount = Math.max(1, Object.values(counts).reduce(function(a, b){ return Math.max(a, b); }, 0));
    var bars = Object.keys(counts).sort(function(a, b){ return counts[b] - counts[a]; }).map(function(k){
      var pct = Math.round((counts[k] / maxCount) * 100);
      return '<div class="bar-row"><span>' + escapeHtml(k) + '</span><div class="track"><div class="fill" style="width:' + pct + '%"></div></div><span class="count">' + counts[k] + '</span></div>';
    }).join('');
    $('#typeBars').innerHTML = bars || '<div class="empty">Add sarees to see the breakdown.</div>';
  }
  function tile(label, value, accent){
    return '<div class="stat"><div class="label">' + label + '</div><div class="value' + (accent ? ' accent' : '') + '">' + value + '</div></div>';
  }

  // ---------- csv export ----------
  $('#exportCsvBtn').addEventListener('click', function(){
    var cols = ['productId', 'color', 'typeName', 'typeCode', 'landingCost', 'status', 'soldPrice', 'soldTo', 'notes', 'addedBy', 'soldBy'];
    var lines = [cols.join(',')];
    sarees.forEach(function(r){
      lines.push(cols.map(function(c){
        var v = r[c] == null ? '' : String(r[c]);
        if (v.indexOf(',') !== -1 || v.indexOf('"') !== -1){ v = '"' + v.replace(/"/g, '""') + '"'; }
        return v;
      }).join(','));
    });
    downloadBlob('kairavi-inventory.csv', new Blob([lines.join('\n')], {type: 'text/csv'}));
  });

  // ---------- tabs ----------
  $('#tabs').addEventListener('click', function(e){
    var btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    $all('button', this).forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    $all('section[data-view]').forEach(function(s){ s.hidden = s.dataset.view !== btn.dataset.tab; });
    if (btn.dataset.tab !== 'scan') stopScanner();
  });

  updatePreview();
  initAuth();
})();
