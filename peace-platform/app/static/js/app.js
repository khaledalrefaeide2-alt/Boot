/* Peace Emergency Platform — progressive enhancement.
 *
 * Every feature below has a working server-rendered fallback. If this file
 * fails to load, is blocked, or throws, the site still works: forms submit
 * normally and pages render server-side. That is the point — on a congested
 * network the HTML arrives long before the JavaScript does.
 *
 * No framework, no build step, no external requests. ~4 KB.
 */
(function () {
  "use strict";

  // Strings arrive in a data attribute rather than an inline <script>, so the
  // Content-Security-Policy can forbid inline script entirely.
  var t = {};
  try {
    t = JSON.parse(document.body.getAttribute("data-i18n") || "{}");
  } catch (error) {
    t = {};
  }

  function text(key, fallback) {
    return t[key] || fallback || key;
  }

  /* ---- Assistant: answer in place instead of a full page reload -------- */

  function initAssistant() {
    var form = document.querySelector("[data-assistant-form]");
    var result = document.querySelector("[data-assistant-result]");
    var input = form && form.querySelector("[name=question]");
    if (!form || !result || !input) return;

    // Only take over once we know fetch is available; otherwise leave the
    // native form submission alone.
    if (typeof window.fetch !== "function") return;

    form.addEventListener("submit", function (event) {
      var question = input.value.trim();
      if (!question) return;
      event.preventDefault();
      ask(question);
    });

    document.querySelectorAll("[data-suggestion]").forEach(function (chip) {
      chip.addEventListener("click", function (event) {
        event.preventDefault();
        input.value = chip.getAttribute("data-suggestion");
        ask(input.value);
        input.focus();
      });
    });

    function ask(question) {
      showSkeleton();
      fetch("/api/v1/assistant/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question, locale: document.documentElement.lang }),
        credentials: "same-origin"
      })
        .then(function (response) {
          if (response.status === 429) throw new Error("rate_limited");
          if (!response.ok) throw new Error("http_" + response.status);
          return response.json();
        })
        .then(render)
        .catch(function (error) {
          renderNotice(
            error.message === "rate_limited"
              ? text("ui.ratelimited")
              : text("ui.error"),
            "is-blocked"
          );
        });
    }

    function showSkeleton() {
      result.innerHTML =
        '<div class="assistant-answer" aria-busy="true">' +
        '<p class="muted small">' + escapeHtml(text("assistant.thinking")) + "</p>" +
        '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>' +
        "</div>";
    }

    function render(data) {
      if (!data.is_answer) {
        renderNotice(
          text(data.message_key || "assistant.insufficient"),
          data.verdict === "blocked" ? "is-blocked" : "is-insufficient",
          data
        );
        return;
      }

      var html = '<div class="assistant-answer stack">';
      html += "<h2>" + escapeHtml(text("assistant.answer")) + "</h2>";
      html += '<div class="answer-text">' + escapeHtml(data.answer) + "</div>";
      html += confidenceHtml(data.confidence);

      if (data.conflicts && data.conflicts.length) {
        html +=
          '<p class="note note-warn">' + escapeHtml(text("assistant.conflict")) + "</p>";
      }
      html += citationsHtml(data.citations);
      html += emergencyHtml(data);
      html +=
        '<p class="note small">' + escapeHtml(text("assistant.disclaimer")) + "</p>";
      html += feedbackHtml(data.question_id);
      html += "</div>";

      result.innerHTML = html;
      wireFeedback(data.question_id);
      focusResult();
    }

    function renderNotice(message, variant, data) {
      var html =
        '<div class="assistant-answer ' + variant + ' stack">' +
        "<p>" + escapeHtml(message) + "</p>";
      if (data) html += emergencyHtml(data);
      html +=
        '<p class="small muted">' +
        escapeHtml(text("assistant.insufficient.next")) +
        "</p></div>";
      result.innerHTML = html;
      focusResult();
    }

    function confidenceHtml(confidence) {
      // Quantised to 5% and expressed as a data attribute: the stylesheet owns
      // the width, so the CSP needs no inline-style exception.
      var pct = Math.round((confidence || 0) * 100 / 5) * 5;
      var level =
        confidence >= 0.7 ? "high" : confidence >= 0.45 ? "medium" : "low";
      return (
        '<div class="confidence"><span>' +
        escapeHtml(text("assistant.confidence")) +
        ": " +
        escapeHtml(text("assistant.confidence." + level)) +
        '</span><span class="confidence-bar"><span class="confidence-fill' +
        (level === "low" ? " low" : "") +
        '" data-pct="' + pct + '"></span></span></div>'
      );
    }

    function citationsHtml(citations) {
      if (!citations || !citations.length) return "";
      var html =
        "<h3>" + escapeHtml(text("assistant.sources")) + '</h3><ul class="citation-list">';
      citations.forEach(function (c) {
        html += '<li><span class="citation-label">' + c.label + "</span>";
        html += "<strong>" + escapeHtml(c.title || "") + "</strong>";
        if (c.organization) html += " — " + escapeHtml(c.organization);
        if (c.published_at)
          html += ' <span class="muted small">' + escapeHtml(c.published_at.slice(0, 10)) + "</span>";
        if (c.url)
          html +=
            ' <a href="' + escapeAttr(c.url) + '" rel="noopener noreferrer nofollow">↗</a>';
        html += "</li>";
      });
      return html + "</ul>";
    }

    function emergencyHtml(data) {
      if (!data.recommend_emergency_contact || !data.emergency_services) return "";
      var html =
        '<div class="note note-critical stack"><p class="mb-0"><strong>' +
        escapeHtml(text("assistant.emergency_directory")) +
        "</strong></p><ul>";
      data.emergency_services.forEach(function (s) {
        html +=
          "<li>" + escapeHtml(s.organization) +
          ': <a class="ltr" href="tel:' + escapeAttr(s.phone.replace(/\s/g, "")) + '">' +
          escapeHtml(s.phone) + "</a>";
        if (s.is_demo)
          html += ' <span class="badge badge-demo">' + escapeHtml(text("demo.number")) + "</span>";
        html += "</li>";
      });
      return html + "</ul></div>";
    }

    function feedbackHtml(questionId) {
      if (!questionId) return "";
      return (
        '<div class="row" data-feedback="' + questionId + '">' +
        "<span>" + escapeHtml(text("assistant.feedback")) + "</span>" +
        '<button type="button" class="chip" data-helpful="1">' +
        escapeHtml(text("assistant.feedback.yes")) + "</button>" +
        '<button type="button" class="chip" data-helpful="0">' +
        escapeHtml(text("assistant.feedback.no")) + "</button></div>"
      );
    }

    function wireFeedback(questionId) {
      var box = result.querySelector("[data-feedback]");
      if (!box) return;
      box.querySelectorAll("[data-helpful]").forEach(function (button) {
        button.addEventListener("click", function () {
          fetch("/api/v1/assistant/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question_id: questionId,
              helpful: button.getAttribute("data-helpful") === "1"
            }),
            credentials: "same-origin"
          }).finally(function () {
            box.innerHTML =
              '<span class="muted small">' +
              escapeHtml(text("assistant.feedback.thanks")) +
              "</span>";
          });
        });
      });
    }

    function focusResult() {
      // Move focus so a screen reader announces the answer immediately.
      var heading = result.querySelector("h2, p");
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: false });
      }
    }
  }

  /* ---- Confirmation for destructive dashboard actions ------------------ */

  function initConfirms() {
    document.querySelectorAll("[data-confirm]").forEach(function (form) {
      form.addEventListener("submit", function (event) {
        if (!window.confirm(form.getAttribute("data-confirm"))) {
          event.preventDefault();
        }
      });
    });
  }

  /* ---- Offline notice --------------------------------------------------- */

  function initOfflineNotice() {
    var notice = document.querySelector("[data-offline-notice]");
    if (!notice) return;
    function sync() {
      notice.hidden = navigator.onLine !== false;
    }
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    sync();
  }

  /* ---- Helpers ---------------------------------------------------------- */

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    try {
      initAssistant();
      initConfirms();
      initOfflineNotice();
    } catch (error) {
      // Enhancement must never break the page it is enhancing.
      if (window.console && console.warn) console.warn("enhancement failed", error);
    }
  });
})();
