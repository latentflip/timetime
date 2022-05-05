// Initialize button with users's prefered color
let anchorTime = document.getElementById("anchor-time");
let fromTime = document.getElementById("from-time");
let toTime = document.getElementById("to-time");

let timeForm = document.getElementById("time-form");
let updateCurrent = document.getElementById("update-current-page");

const toDateFieldValue = (str) => {
  return str.toISOString().split(".")[0];
};

const parseDateFieldValue = (str) => {
  if (str.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) str += ":00";
  if (str.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)) str += "Z";
  return new Date(str);
};

const setFieldValue = (
  field,
  value,
  { preventLockUpdate } = { preventLockUpdate: false }
) => {
  field.value = value;
  field.dispatchEvent(
    new CustomEvent("change", {
      detail: { preventLockUpdate: preventLockUpdate },
    })
  );
};

// Load initial field values
chrome.storage.local.get(["anchor", "from", "to"], ({ anchor, from, to }) => {
  if (anchor) setFieldValue(anchorTime, anchor, { preventLockUpdate: true });
  if (from) setFieldValue(fromTime, from, { preventLockUpdate: true });
  if (to) setFieldValue(toTime, to, { preventLockUpdate: true });
});

// Lock current page to timestamps
chrome.storage.local.get(["lock"], ({ lock }) => {
  if (lock) {
    document.querySelector(".lock-current-page").checked = true;
  }
});

events.on("change", ".lock-current-page", (e) => {
  chrome.storage.local.set({ lock: e.target.checked });
});

events.on("change", ".time-field input[type=datetime-local]", async (e) => {
  const name = e.target.getAttribute("name");
  const value = e.target.value;
  if (name && name !== "") {
    const obj = {};
    obj[name] = value;
    await chrome.storage.local.set(obj);

    // Don't refresh the current page if we are only opening the popup
    if (!e.detail?.preventLockUpdate) {
      chrome.storage.local.get(["lock"], ({ lock }) => {
        if (lock) {
          debouncedUpdateCurrentPage();
        }
      });
    }
  }
});

events.on("dblclick", ".epoch, .iso", (e) => {
  navigator.clipboard.writeText(e.target.innerText).then(
    () => {
      e.target.classList.add("copied");
      setTimeout(() => {
        e.target.classList.remove("copied");
      }, 500);
      //clipboard successfully set
    },
    () => {
      //clipboard write failed, use fallback
    }
  );
});

// Update epochs
events.on("change", ".time-field input[type=datetime-local]", (e) => {
  const date = parseDateFieldValue(e.target.value);
  e.target.closest(".time-field").querySelector(".epoch").innerText = (
    +date / 1000
  ).toString();
  e.target.closest(".time-field").querySelector(".iso").innerText =
    date.toISOString();
});

events.on("click", ".modify-to", (e) => {
  const button = e.target;
  const amount = button?.dataset.amount;
  if (amount) modifyTimestamps("to", amount);
});

events.on("click", ".modify-around", (e) => {
  const button = e.target;
  const amount = button?.dataset.amount;
  if (amount) modifyTimestamps("around", amount);
});

const modifyTimestamps = (type, amount) => {
  const multipliers = {
    m: 1000 * 60,
    h: 1000 * 60 * 60,
    d: 1000 * 60 * 60 * 24,
  };

  const offset =
    parseInt(amount.slice(0, amount.length - 1), 10) *
    multipliers[amount.charAt(amount.length - 1)];

  const startTime = parseDateFieldValue(anchorTime.value);

  if (type == "to") {
    setFieldValue(fromTime, toDateFieldValue(startTime));
    setFieldValue(
      toTime,
      toDateFieldValue(new Date(startTime.getTime() + offset))
    );
  } else if (type == "around") {
    setFieldValue(
      fromTime,
      toDateFieldValue(new Date(startTime.getTime() - offset))
    );
    setFieldValue(
      toTime,
      toDateFieldValue(new Date(startTime.getTime() + offset))
    );
  }
};

updateCurrent.addEventListener("click", async (e) => {
  e.preventDefault();

  await updateCurrentPage();
});

events.on("click", ".import-times", async (e) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { from, to, anchor } = importTimestamps(tab.url);

  setFieldValue(fromTime, toDateFieldValue(from), { preventLockUpdate: true });
  setFieldValue(toTime, toDateFieldValue(to), { preventLockUpdate: true });
  setFieldValue(anchorTime, toDateFieldValue(anchor), {
    preventLockUpdate: true,
  });
});

const updateCurrentPage = async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: updateTimestampsOnCurrentPage,
  });
};

let timeout = null;
function debouncedUpdateCurrentPage() {
  clearTimeout(timeout);
  timeout = setTimeout(updateCurrentPage, 200);
}


function updateTimestampsOnCurrentPage() {
  const parseDateFieldValue = (str) => {
    if (str.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) str += ":00";
    if (str.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)) str += "Z";
    return new Date(str);
  };

  const asMs = (str) => {
    return parseDateFieldValue(str).getTime().toString();
  };
  const asSeconds = (str) => {
    return (parseDateFieldValue(str).getTime() / 1000).toString();
  };

  const prevQp = new URLSearchParams(window.location.search);
  const qp = new URLSearchParams(window.location.search);

  const loadNewQp = (newQp) => {
    if (newQp.toString() !== prevQp.toString()) {
      console.log("Updating QS");
      console.log("- " + prevQp.toString());
      console.log("+ " + newQp.toString());
      window.location.search = "?" + newQp.toString();
    }
  };

  const fns = {
    splunk: (from, to) => {
      qp.set("earliest", asSeconds(from));
      qp.set("latest", asSeconds(to));
      qp.delete("sid");
      loadNewQp(qp);
    },
    "app.datadoghq.com": (from, to) => {
      if (qp.get("fullscreen_start_ts")) {
        qp.set("fullscreen_start_ts", asMs(from));
      }
      if (qp.get("fullscreen_end_ts")) qp.set("fullscreen_end_ts", asMs(to));
      qp.set("from_ts", asMs(from));
      qp.set("to_ts", asMs(to));
      qp.set("live", "false")
      loadNewQp(qp);
    },
    "vividcortex.com": (from, to) => {
      qp.set("from", asSeconds(from));
      qp.set("until", asSeconds(to));
      loadNewQp(qp);
    },
  };

  for (let url of Object.keys(fns)) {
    if (window.location.host.includes(url)) {
      chrome.storage.local.get(["from", "to"], ({ from, to }) => {
        console.log({ from, to });
        const fn = fns[url];
        if (fn) fn(from, to);
      });
      break;
    }
  }
}
