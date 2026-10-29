
"use strict";

const form = document.getElementById("releaseForm");
const audioInput = document.getElementById("audioFile");
const coverInput = document.getElementById("coverFile");
const audioName = document.getElementById("audioName");
const coverName = document.getElementById("coverName");
const dateInput = document.getElementById("releaseDate");
const timezoneInput = document.getElementById("timezone");
const releasesElement = document.getElementById("releases");
const releaseCount = document.getElementById("releaseCount");
const message = document.getElementById("message");
const clearButton = document.getElementById("clearReleases");

const STORAGE_KEY = "freewave-releases-v1";
let releases = loadReleases();

function loadReleases() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveReleases() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(releases));
    return true;
  } catch {
    setMessage(
      "Browser storage is full. Remove some releases or use smaller cover images.",
      true
    );
    return false;
  }
}

function setMessage(text, error = false) {
  message.textContent = text;
  message.style.color = error ? "#f2a8b4" : "";
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function localDateValue(date) {
  const pad = value => String(value).padStart(2, "0");

  return (
    date.getFullYear() + "-" +
    pad(date.getMonth() + 1) + "-" +
    pad(date.getDate()) + "T" +
    pad(date.getHours()) + ":" +
    pad(date.getMinutes())
  );
}

// Default to one day from now.
const defaultDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
dateInput.min = localDateValue(new Date());
dateInput.value = localDateValue(defaultDate);

audioInput.addEventListener("change", () => {
  const file = audioInput.files[0];
  audioName.textContent = file
    ? `${file.name} (${formatBytes(file.size)})`
    : "No file selected";
});

coverInput.addEventListener("change", () => {
  const file = coverInput.files[0];
  coverName.textContent = file
    ? `${file.name} (${formatBytes(file.size)})`
    : "Optional JPG, PNG, or WebP";
});

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatReleaseDate(date, timezone) {
  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone
    }).format(new Date(date));
  } catch {
    return new Date(date).toLocaleString();
  }
}

function getStatus(release) {
  // This is a local dashboard label, not a real distribution status.
  return Date.now() >= new Date(release.date).getTime()
    ? "Release time passed"
    : "Saved draft";
}

function renderReleases() {
  releaseCount.textContent = releases.length;

  if (!releases.length) {
    releasesElement.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">♫</div>
        <strong>No releases yet</strong>
        <p>Your saved tracks will appear here.</p>
      </div>`;
    return;
  }

  releasesElement.innerHTML = releases.map(release => {
    const coverMarkup = release.cover
      ? `<img class="release-cover"
              src="${escapeHTML(release.cover)}"
              alt="Cover art for ${escapeHTML(release.title)}">`
      : `<div class="release-cover">♫</div>`;

    return `
      <article class="release-card">
        ${coverMarkup}
        <div class="release-details">
          <strong>${escapeHTML(release.title)}</strong>
          <small>${escapeHTML(release.artist)}</small>
          <small>${escapeHTML(
            formatReleaseDate(release.date, release.timezone)
          )} · ${escapeHTML(release.timezone)}</small>
          <small>${escapeHTML(release.platforms.join(", "))}</small>
          <small>File: ${escapeHTML(release.fileName)}</small>
          <span class="release-status">${escapeHTML(getStatus(release))}</span>
        </div>
        <button class="delete-button"
                type="button"
                data-delete="${escapeHTML(release.id)}"
                aria-label="Delete ${escapeHTML(release.title)}">
          Delete
        </button>
      </article>`;
  }).join("");
}

function readCover(file) {
  if (!file) return Promise.resolve("");

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read cover art."));
    reader.readAsDataURL(file);
  });
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  setMessage("");

  const data = new FormData(form);
  const title = String(data.get("title") || "").trim();
  const artist = String(data.get("artist") || "").trim();
  const audio = audioInput.files[0];
  const cover = coverInput.files[0];
  const releaseDate = dateInput.value;
  const timezone = timezoneInput.value;
  const platforms = data.getAll("platform");

  if (!title || !artist) {
    setMessage("Enter a song title and artist name.", true);
    return;
  }

  if (!audio || !audio.type.startsWith("audio/")) {
    setMessage("Choose a valid audio file.", true);
    return;
  }

  if (!releaseDate || new Date(releaseDate).getTime() <= Date.now()) {
    setMessage("Choose a release date and time in the future.", true);
    return;
  }

  if (!platforms.length) {
    setMessage("Select at least one platform.", true);
    return;
  }

  if (!data.get("rights")) {
    setMessage("Confirm that you have the necessary music rights.", true);
    return;
  }

  if (cover && ![
    "image/jpeg",
    "image/png",
    "image/webp"
  ].includes(cover.type)) {
    setMessage("Choose a JPG, PNG, or WebP cover image.", true);
    return;
  }

  // localStorage is limited, so keep cover previews small.
  if (cover && cover.size > 500 * 1024) {
    setMessage("For this demo, choose cover art smaller than 500 KB.", true);
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Saving...";

  try {
    const coverData = await readCover(cover);

    const release = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
      title,
      artist,
      fileName: audio.name,
      // The audio itself is NOT uploaded or saved.
      date: new Date(releaseDate).toISOString(),
      timezone,
      platforms,
      cover: coverData,
      createdAt: new Date().toISOString()
    };

    releases.unshift(release);

    if (!saveReleases()) {
      releases.shift();
      return;
    }

    renderReleases();
    form.reset();

    dateInput.min = localDateValue(new Date());
    dateInput.value = localDateValue(
      new Date(Date.now() + 24 * 60 * 60 * 1000)
    );

    audioName.textContent = "No file selected";
    coverName.textContent = "Optional JPG, PNG, or WebP";

    setMessage(
      "Release details saved! No music has been sent to streaming platforms."
    );
  } catch (error) {
    console.error(error);
    setMessage("Could not save this release. Try a smaller cover image.", true);
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Save release <span>↗</span>';
  }
});

releasesElement.addEventListener("click", event => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;

  const id = button.dataset.delete;
  const previous = releases;
  releases = releases.filter(release => release.id !== id);

  if (!saveReleases()) {
    releases = previous;
    return;
  }

  renderReleases();
  setMessage("Release removed from this browser.");
});

clearButton.addEventListener("click", () => {
  if (!releases.length) {
    setMessage("There are no saved releases to clear.");
    return;
  }

  if (!confirm("Clear all saved release details from this browser?")) {
    return;
  }

  const previous = releases;
  releases = [];

  if (!saveReleases()) {
    releases = previous;
    return;
  }

  renderReleases();
  setMessage("All saved release details have been cleared.");
});

renderReleases();
