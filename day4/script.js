const noteText = document.getElementById ("note-text");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeToggle = document.getElementById("theme-toggle");

function updateCounts(){
    const text= noteText.value;
    const characters = text.length;

    charCount.textContent= `${characters} /200 characters`;

    const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;

    wordCount.textContent = `${words} words`;

    charCount.classList.remove("warning", "over");

    if (characters > 180) {
    charCount.classList.add("warning");

    }

    if (characters > 200) {
    charCount.classList.add("over");

    }
}

noteText.addEventListener("input", () => {
    updateCounts();
    localStorage.setItem("noteDraft", noteText.value);

});

const savedDraft = localStorage.getItem("noteDraft");

if (savedDraft !== null) {
    noteText.value = savedDraft;

}
updateCounts();

clearBtn.addEventListener("click", () => {
    noteText.value = "";
    localStorage.removeItem("noteDraft");
    updateCounts();
});

noteText.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        noteText.value = "";
        localStorage.removeItem("noteDraft");
        updateCounts();
    }
});

themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");

    themeToggle.textContent = document.body.classList.contains("dark")
        ? "Light mode"
        : "Dark mode";
    localStorage.setItem(
        "darkMode",
        document.body.classList.contains("dark")
     );
});

const savedTheme = localStorage.getItem("darkMode");

if (savedTheme === "true") {
    document.body.classList.add("dark");
    themeToggle.textContent = "Light mode";
}
