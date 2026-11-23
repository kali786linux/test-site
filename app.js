/*
 * app.js - loads stock.csv, builds the search index and renders the product cards.
 * Needs csv.js (CSVStock) loaded first. FlexSearch is optional: a plain search is used if it fails to load.
 */
(function () {
  "use strict";

  // ---------- Settings (change these) ----------
  var DATA_URL = "stock.csv";          // the file your sync script uploads
  var IMAGE_DIR = "images/";           // photos live here, named by SKU: images/HW-101.webp
  var IMAGE_EXT = ".webp";
  var WHATSAPP_NUMBER = "27838000808"; // 083 800 0808 in international format
  var LOW_STOCK_AT = 5;                // this many or fewer shows "Low stock"
  var PAGE_SIZE = 48;                  // cards shown before "Show more"

  // ---------- State ----------
  var products = [];
  var index = null;
  var activeCat = "All";
  var shown = PAGE_SIZE;

  var $q = document.getElementById("q");
  var $res = document.getElementById("results");
  var $chips = document.getElementById("chips");
  var $count = document.getElementById("count");
  var $updated = document.getElementById("updated");
  var $status = document.getElementById("status");
  var $more = document.getElementById("more");
  var $instock = document.getElementById("instock");

  // ---------- Helpers ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) {
    return "R" + Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function showError(title, html) {
    $count.textContent = "";
    $res.innerHTML = "";
    $more.hidden = true;
    $status.innerHTML = '<div class="state"><h2>' + title + "</h2><p>" + html + "</p></div>";
  }

  // ---------- Load the CSV ----------
  function load() {
    fetch(DATA_URL + "?t=" + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        // "Last-Modified" is set by S3/CloudFront, so it shows when the file was last uploaded
        var lm = r.headers.get("Last-Modified");
        if (lm) {
          var d = new Date(lm);
          if (!isNaN(d)) $updated.textContent = "Stock updated " + d.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
        }
        return r.text();
      })
      .then(function (text) {
        var parsed = CSVStock.csvToProducts(text);
        if (parsed.missing.length) {
          showError("Stock file not recognised",
            "Could not find these columns in <code>" + esc(DATA_URL) + "</code>: <b>" + parsed.missing.join(", ") +
            "</b>.<br>Columns found: " + (parsed.headers.map(esc).join(", ") || "none") +
            "<br>Add the column names to ALIASES in csv.js.");
          return;
        }
        products = parsed.products;
        buildChips();
        buildIndex();
        render();
      })
      .catch(function () {
        showError("Stock list unavailable", "Please call us on 083 800 0808.");
      });
  }

  // ---------- Search ----------
  function buildIndex() {
    if (!window.FlexSearch) return;
    index = new FlexSearch.Index({ tokenize: "forward", cache: 100 });
    products.forEach(function (p, i) {
      index.add(i, p.name + " " + p.sku + " " + p.category);
    });
  }
  function search(term) {
    term = term.trim();
    if (!term) return products.slice();
    if (index) {
      return index.search(term, { limit: 1000 }).map(function (i) { return products[i]; });
    }
    var words = term.toLowerCase().split(/\s+/);
    return products.filter(function (p) {
      var hay = (p.name + " " + p.sku + " " + p.category).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) !== -1; });
    });
  }

  // ---------- Categories ----------
  function buildChips() {
    var cats = ["All"];
    products.forEach(function (p) { if (cats.indexOf(p.category) === -1) cats.push(p.category); });
    $chips.innerHTML = cats.map(function (c) {
      return '<button class="chip' + (c === activeCat ? " active" : "") + '" data-cat="' + esc(c) + '">' + esc(c) + "</button>";
    }).join("");
  }

  // ---------- Cards ----------
  var PLACEHOLDER = '<svg class="ph" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z"/></svg>';

  function statusOf(p) {
    if (p.stock <= 0) return { cls: "out", text: "Out of stock" };
    if (p.stock <= LOW_STOCK_AT) return { cls: "low", text: "Low stock" };
    return { cls: "in", text: "In stock" };
  }

  function reserveLink(p) {
    var msg = "Hi Amos Hardware Port Shepstone, I would like to reserve:\n\n" +
      p.name + "\nSKU: " + p.sku + "\nPrice: " + money(p.price) +
      "\nQuantity: 1\n\nPlease confirm availability. Thank you.";
    return "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(msg);
  }

  function cardHTML(p) {
    var s = statusOf(p);
    var qtyText = p.stock > 0
      ? (p.stock <= LOW_STOCK_AT ? "Only " + p.stock + " left" : p.stock + " available")
      : "Currently unavailable";
    var reserve = p.stock > 0
      ? '<a class="reserve" target="_blank" rel="noopener" href="' + reserveLink(p) + '">Reserve on WhatsApp</a>'
      : '<a class="reserve disabled">Out of stock</a>';
    return '<article class="card">' +
      '<div class="img">' + PLACEHOLDER +
      '<img src="' + IMAGE_DIR + encodeURIComponent(p.sku) + IMAGE_EXT + '" alt="' + esc(p.name) + '" loading="lazy" onerror="this.remove()">' +
      '<span class="badge ' + s.cls + '">' + s.text + "</span></div>" +
      '<div class="body">' +
      '<div class="cat">' + esc(p.category) + "</div>" +
      '<div class="name">' + esc(p.name) + "</div>" +
      '<div class="sku">SKU: ' + esc(p.sku) + "</div>" +
      '<div class="qty">' + qtyText + "</div>" +
      '<div class="row"><span class="price">' + money(p.price) + '</span><span class="loc">' +
      (p.aisle ? "Aisle " + esc(p.aisle) : "Ask in store") + "</span></div>" +
      "</div>" + reserve + "</article>";
  }

  function render(reset) {
    if (reset !== false) shown = PAGE_SIZE;
    var list = search($q.value);
    if (activeCat !== "All") list = list.filter(function (p) { return p.category === activeCat; });
    if ($instock.checked) list = list.filter(function (p) { return p.stock > 0; });

    $count.textContent = list.length + (list.length === 1 ? " product" : " products");
    $res.innerHTML = list.slice(0, shown).map(cardHTML).join("");
    $more.hidden = list.length <= shown;

    $status.innerHTML = list.length ? "" :
      '<div class="state"><h2>No products found</h2><p>Try a different word, or call us on 083 800 0808. We may still have it.</p></div>';
  }

  // ---------- Events ----------
  var timer;
  $q.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(render, 120);
  });
  $instock.addEventListener("change", render);
  $chips.addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    activeCat = b.getAttribute("data-cat");
    buildChips();
    render();
  });
  $more.addEventListener("click", function () {
    shown += PAGE_SIZE;
    render(false);
  });

  load();
})();
