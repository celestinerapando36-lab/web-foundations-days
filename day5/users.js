const API_URL = "https://jsonplaceholder.typicode.com/users";

const loadBtn = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusText = document.querySelector("#status");
const usersList = document.querySelector("#users-list");


let allUsers = [];

function renderUsers(list) {
  usersList.innerHTML = "";

  if (list.length === 0) {
    if (allUsers.length > 0) {
      const li = document.createElement("li");
      li.textContent = "No users match your filter.";
      usersList.appendChild(li);
    }
    return;
  }

  list.forEach((user) => {
    const li = document.createElement("li");

    const name = document.createElement("span");
    name.className = "user-name";
    name.textContent = user.name;

    const email = document.createElement("span");
    email.className = "user-detail";
    email.textContent = `Email: ${user.email}`;

    const city = document.createElement("span");
    city.className = "user-detail";
    city.textContent = `City: ${user.address.city}`;

    const company = document.createElement("span");
    company.className = "user-detail";
    company.textContent = `Company: ${user.company.name}`;

    li.append(name, email, city, company);
    usersList.appendChild(li);
  });
}

function applyFilter() {
  const text = filterInput.value.trim().toLowerCase();
  const matches = allUsers.filter((user) =>
    user.name.toLowerCase().includes(text)
  );
  renderUsers(matches);
}

async function loadUsers() {
  statusText.textContent = "Loading users...";
  loadBtn.disabled = true;
  usersList.innerHTML = "";

  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    allUsers = await response.json();
    applyFilter(); 
    statusText.textContent = `Loaded ${allUsers.length} users.`;
  } catch (error) {
    allUsers = [];
    statusText.textContent = "Could not load users. Please try again.";
    console.error("Could not load users:", error.message);
  } finally {
    loadBtn.disabled = false; 
  }
}

loadBtn.addEventListener("click", loadUsers);
filterInput.addEventListener("input", applyFilter);