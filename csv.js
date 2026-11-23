/*
 * csv.js - CSV parsing for the stock list.
 *
 * Handles what real-world exports throw at you:
 *   - comma, semicolon or tab separators (South African Excel often saves with ";")
 *   - quoted fields, commas/newlines inside quotes, "" as an escaped quote
 *   - UTF-8 BOM and Windows (CRLF) line endings
 *   - prices like "R1 299,00", "1,299.00" or "1299.00"
 *   - header names that differ between exports ("Stock Code", "Description", "Qty On Hand"...)
 *
 * To support a new column name, add it to ALIASES below (lowercase, letters and digits only).
 */
(function () {
  "use strict";

  // Normalised header name -> the field it fills. First match in the file wins.
  var ALIASES = {
    sku:      ["sku", "code", "stockcode", "itemcode", "productcode", "partno", "barcode", "plu"],
    name:     ["name", "description", "productname", "product", "item", "itemdescription", "stockdescription"],
    category: ["category", "department", "dept", "group", "productgroup", "range"],
    price:    ["price", "sellingprice", "sellprice", "retailprice", "priceincl", "priceinclvat", "inclprice", "sell"],
    stock:    ["stock", "qty", "quantity", "onhand", "qtyonhand", "qoh", "stockonhand", "available"],
    aisle:    ["aisle", "location", "bin", "shelf", "loc"]
  };
  var REQUIRED = ["name", "price"];

  function normHeader(h) {
    return String(h).toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  // Look at the first line (outside quotes) and pick the most common separator.
  function detectDelimiter(text) {
    var counts = { ",": 0, ";": 0, "\t": 0 };
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === '"') inQuotes = !inQuotes;
      else if (!inQuotes) {
        if (c === "\n" || c === "\r") break;
        if (counts.hasOwnProperty(c)) counts[c]++;
      }
    }
    var best = ",", max = -1;
    for (var d in counts) if (counts[d] > max) { max = counts[d]; best = d; }
    return best;
  }

  // Returns an array of rows, each an array of strings.
  function parseCSV(text) {
    text = String(text).replace(/^﻿/, "");
    var delim = detectDelimiter(text);
    var rows = [], row = [], field = "", inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }   // escaped quote
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === delim) {
        row.push(field); field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        rows.push(row); row = [];
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }

    // Drop blank lines
    return rows.filter(function (r) {
      return r.some(function (cell) { return String(cell).trim() !== ""; });
    });
  }

  // "R1 299,00" / "1,299.00" / "1299.00" / "1.299,00" -> number
  function parseNumber(v) {
    var s = String(v == null ? "" : v).replace(/[^\d.,-]/g, "");
    if (!s) return 0;
    var lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
    if (lastComma > -1 && lastDot > -1) {
      // Whichever comes last is the decimal mark
      s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    } else if (lastComma > -1) {
      // "12,50" = decimal comma; "1,299" = thousands separator
      s = /,\d{1,2}$/.test(s) ? s.replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "") : s.replace(/,/g, "");
    }
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  // CSV text -> { products: [...], missing: [...], headers: [...] }
  function csvToProducts(text) {
    var rows = parseCSV(text);
    if (!rows.length) return { products: [], missing: REQUIRED.slice(), headers: [] };

    var headers = rows[0].map(function (h) { return String(h).trim(); });
    var normalised = headers.map(normHeader);

    // Work out which column feeds which field
    var col = {};
    Object.keys(ALIASES).forEach(function (field) {
      for (var a = 0; a < ALIASES[field].length; a++) {
        var idx = normalised.indexOf(ALIASES[field][a]);
        if (idx !== -1) { col[field] = idx; break; }
      }
    });

    var missing = REQUIRED.filter(function (f) { return col[f] === undefined; });
    if (missing.length) return { products: [], missing: missing, headers: headers };

    function cell(r, field) {
      return col[field] === undefined ? "" : String(r[col[field]] == null ? "" : r[col[field]]).trim();
    }

    var products = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      var name = cell(r, "name");
      if (!name) continue;
      products.push({
        sku: cell(r, "sku") || ("ROW-" + i),
        name: name,
        category: cell(r, "category") || "Other",
        price: parseNumber(cell(r, "price")),
        stock: Math.round(parseNumber(cell(r, "stock"))),
        aisle: cell(r, "aisle")
      });
    }
    return { products: products, missing: [], headers: headers };
  }

  var api = { parseCSV: parseCSV, parseNumber: parseNumber, csvToProducts: csvToProducts };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.CSVStock = api;
})();
