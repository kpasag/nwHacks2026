import { useEffect, useRef, useState } from "react";
import "./Dashboard.css";

function Dashboard() {
  const [currentPills, setCurrentPills] = useState([
    {
      id: 1,
      name: "John Doe",
      medicine: "Aspirin",
      time: "08:00 AM",
      status: "missed",
    },
    {
      id: 2,
      name: "Jane Smith",
      medicine: "Vitamin D",
      time: "01:00 PM",
      status: "taken",
    },
  ]);

  const notifications = [
    { id: 1, message: "Aspirin taken", date: "Jan 15, 08:05" },
    { id: 2, message: "Vitamin D missed", date: "Jan 14, 13:30" },
    { id: 3, message: "New Vitamin C scheduled", date: "Jan 13, 09:00" },
  ];

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [pillForm, setPillForm] = useState({
    pillName: "",
    dosage: "",
    takeTimes: [""], // multiple times per day
    intervalDays: 1, // repeat every N days
  });

  const DPD_BASE = "https://health-products.canada.ca/api/drug/drugproduct/";

  // Brand search state
  const [brandQuery, setBrandQuery] = useState("");
  const [brandGroups, setBrandGroups] = useState([]); // [{ label: "TYLENOL", count: 42 }]
  const [isBrandDropdownOpen, setIsBrandDropdownOpen] = useState(false);

  const [selectedBrand, setSelectedBrand] = useState(""); // e.g., "TYLENOL"
  const [productOptions, setProductOptions] = useState([]); // [{ id, label, din }]
  const [selectedProductId, setSelectedProductId] = useState("");

  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState("");

  const abortRef = useRef(null);
  const cacheRef = useRef(new Map()); // key: query -> raw normalized list

  const totalPills = currentPills.length;

  const openAddModal = () => setIsAddModalOpen(true);

  const closeAddModal = () => {
    setIsAddModalOpen(false);
    setPillForm({ pillName: "", dosage: "", takeTimes: [""], intervalDays: 1 });

    setBrandQuery("");
    setBrandGroups([]);
    setIsBrandDropdownOpen(false);

    setSelectedBrand("");
    setProductOptions([]);
    setSelectedProductId("");
    setSuggestionsError("");
    setIsLoadingSuggestions(false);

    if (abortRef.current) abortRef.current.abort();
  };

  useEffect(() => {
    if (!isAddModalOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") closeAddModal();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAddModalOpen]);

  // Fetch brand search results (fast + cached + debounced)
  useEffect(() => {
    if (!isAddModalOpen) return;

    const q = brandQuery.trim();
    setSuggestionsError("");

    // Show dropdown while typing, but do not fetch at 1 character (too slow / too broad)
    if (q.length === 0) {
      setBrandGroups([]);
      setIsBrandDropdownOpen(false);
      setSelectedBrand("");
      setProductOptions([]);
      setSelectedProductId("");
      return;
    }

    if (q.length === 1) {
      setBrandGroups([{ label: "Keep typing...", count: 0 }]);
      setIsBrandDropdownOpen(true);
      setSelectedBrand("");
      setProductOptions([]);
      setSelectedProductId("");
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        setIsLoadingSuggestions(true);

        const cacheKey = q.toLowerCase();
        if (cacheRef.current.has(cacheKey)) {
          const cached = cacheRef.current.get(cacheKey);
          const groups = buildBrandGroups(cached, q);
          setBrandGroups(groups);
          setIsBrandDropdownOpen(true);
          return;
        }

        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const url = new URL(DPD_BASE);
        url.searchParams.set("brandname", q);
        url.searchParams.set("status", "2"); // marketed
        url.searchParams.set("lang", "en");
        url.searchParams.set("type", "json");

        const res = await fetch(url.toString(), {
          method: "GET",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        if (!res.ok) throw new Error(`DPD search failed (${res.status})`);

        const data = await res.json();

        const normalized = Array.isArray(data)
          ? data
              .map((x) => ({
                id: x.drug_code,
                label: x.brand_name,
                din: x.drug_identification_number,
              }))
              .filter((x) => x.label)
          : [];

        cacheRef.current.set(cacheKey, normalized);

        const groups = buildBrandGroups(normalized, q);
        setBrandGroups(groups);
        setIsBrandDropdownOpen(true);
      } catch (err) {
        if (err?.name === "AbortError") return;
        setBrandGroups([]);
        setIsBrandDropdownOpen(true);
        setSuggestionsError(err?.message || "Failed to load suggestions");
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [brandQuery, isAddModalOpen]);

  const buildBrandGroups = (normalized, q) => {
    // Prioritize items that contain the query (DPD already does contains),
    // then build "brand groups" using first word.
    const qLower = q.toLowerCase();

    const relevant = normalized
      .filter((x) => x.label && x.label.toLowerCase().includes(qLower))
      .slice(0, 500); // guardrail: avoid grouping an enormous list

    const counts = new Map();
    for (const item of relevant) {
      const firstWord = item.label.split(" ")[0]?.trim();
      if (!firstWord) continue;
      const key = firstWord.toUpperCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    // Sort by count desc, but also make sure groups that start with query float to top
    const qUpper = q.toUpperCase();
    const groups = Array.from(counts.entries()).map(([label, count]) => ({
      label,
      count,
    }));

    groups.sort((a, b) => {
      const aStarts = a.label.startsWith(qUpper) ? 1 : 0;
      const bStarts = b.label.startsWith(qUpper) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;
      return b.count - a.count;
    });

    return groups.slice(0, 10);
  };

  const chooseBrandGroup = (groupLabel) => {
    if (groupLabel === "Keep typing...") return;

    setSelectedBrand(groupLabel);
    setIsBrandDropdownOpen(false);

    // Build product list under this brand group using cached results for the current query
    const q = brandQuery.trim().toLowerCase();
    const normalized = cacheRef.current.get(q) || [];

    const products = normalized
      .filter((x) => x.label && x.label.toUpperCase().startsWith(groupLabel))
      .map((x) => ({
        id: x.id,
        label: x.label,
        din: x.din,
      }));

    // Dedup by label, then limit (this is where your old code could hide Tylenol)
    const seen = new Set();
    const deduped = [];
    for (const p of products) {
      const key = p.label.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(p);
      if (deduped.length >= 25) break;
    }

    setProductOptions(deduped);
    setSelectedProductId("");
    setPillForm((prev) => ({ ...prev, pillName: "" }));
  };

  const chooseProduct = (productId) => {
    setSelectedProductId(productId);

    const chosen = productOptions.find(
      (p) => String(p.id) === String(productId),
    );
    if (!chosen) return;

    setPillForm((prev) => ({ ...prev, pillName: chosen.label }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setPillForm((prev) => ({
      ...prev,
      [name]: name === "intervalDays" ? Number(value) : value,
    }));
  };

  const updateTimeAtIndex = (index, value) => {
    setPillForm((prev) => {
      const next = [...prev.takeTimes];
      next[index] = value;
      return { ...prev, takeTimes: next };
    });

    const totalPills = currentPills.length;
    const bufferMinutes = 5; // clickable window
    const missedAfterMinutes = 15; // mark as late after 15 minutes

    const openAddModal = () => setIsAddModalOpen(true);
    const closeAddModal = () => {
        setIsAddModalOpen(false);
        setPillForm({ pillName: "", dosage: "", takeTimes: [""], intervalDays: 1 });
    };

    useEffect(() => {
        if (!isAddModalOpen) return;
        const onKeyDown = (e) => {
            if (e.key === "Escape") closeAddModal();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isAddModalOpen]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setPillForm((prev) => ({
            ...prev,
            [name]: name === "intervalDays" ? Number(value) : value,
        }));
    };

    const updateTimeAtIndex = (index, value) => {
        setPillForm((prev) => {
            const next = [...prev.takeTimes];
            next[index] = value;
            return { ...prev, takeTimes: next };
        });
    };

    const addTimeField = () => {
        setPillForm((prev) => ({ ...prev, takeTimes: [...prev.takeTimes, ""] }));
    };

    const removeTimeField = (index) => {
        setPillForm((prev) => {
            const next = prev.takeTimes.filter((_, i) => i !== index);
            return { ...prev, takeTimes: next.length ? next : [""] };
        });
    };

    const formatTime = (value) => {
        if (!value) return "";
        const d = new Date(`1970-01-01T${value}:00`);
        if (Number.isNaN(d.getTime())) return value;
        return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    };

    const frequencyText = (days) => (days === 1 ? "daily" : `every ${days} days`);

    const canTakeNow = (rawTimes) => {
        if (!rawTimes || rawTimes.length === 0) return false;
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        return rawTimes.some((timeStr) => {
            const [h, m] = timeStr.split(":").map(Number);
            const pillMinutes = h * 60 + m;
            return Math.abs(nowMinutes - pillMinutes) <= bufferMinutes;
        });
    };

    const isLate = (rawTimes) => {
        if (!rawTimes || rawTimes.length === 0) return false;
        const now = new Date();
        return rawTimes.some((timeStr) => {
            const [h, m] = timeStr.split(":").map(Number);
            const pillTime = new Date();
            pillTime.setHours(h, m, 0, 0);
            return now - pillTime > missedAfterMinutes * 60 * 1000;
        });
    };

    const lateMinutes = (rawTimes) => {
        const now = new Date();
        let maxLate = 0;
        rawTimes.forEach((timeStr) => {
            const [h, m] = timeStr.split(":").map(Number);
            const pillTime = new Date();
            pillTime.setHours(h, m, 0, 0);
            const diff = Math.floor((now - pillTime) / 60000);
            if (diff > maxLate) maxLate = diff;
        });
        return maxLate;
    };

    const takePill = (id, medicine, rawTimes) => {
        setCurrentPills((prev) => prev.filter((pill) => pill.id !== id));

          <div className="pill-cards-container">
            {currentPills.map(({ id, name, medicine, time, status }) => (
              <div key={id} className="pill-card">
                <div className="pill-header">
                  <span className="medicine-name">{medicine}</span>
                  <span className={`status-icon ${status}`}>
                    {status === "taken" && "✓"}
                    {status === "missed" && "x"}
                    {status === "pending" && "..."}
                  </span>
                </div>

    return (
        <div className="dashboard-page">
            <header className="dashboard-header">
                <h1>Dashboard</h1>
                <div className="header-actions">
                    <span>{user?.email}</span>
                    <button onClick={handleLogout} className="logout-btn">Logout</button>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="pill-card add-card"
              onClick={openAddModal}
            >
              <span className="plus-sign">+</span>
              <div>Add Pill</div>
            </button>
          </div>
        </section>

        <section className="notifications-section">
          <h2>Notifications</h2>
          {notifications.map(({ id, message, date }) => (
            <div key={id} className="notification-item">
              <div>{message}</div>
              <small>{date}</small>
            </div>
          ))}
        </section>
      </main>

      {isAddModalOpen && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeAddModal();
          }}
        >
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <h3 className="modal-title">Add Pill</h3>
              <button
                type="button"
                className="modal-close"
                onClick={closeAddModal}
                aria-label="Close"
              >
                x
              </button>
            </div>

            <form className="modal-body" onSubmit={handleSubmit}>
              <label className="modal-label" style={{ position: "relative" }}>
                Brand
                <input
                  className="modal-input"
                  value={brandQuery}
                  onChange={(e) => {
                    setBrandQuery(e.target.value);
                    setSelectedBrand("");
                    setProductOptions([]);
                    setSelectedProductId("");
                    setPillForm((prev) => ({ ...prev, pillName: "" }));
                    setIsBrandDropdownOpen(true);
                  }}
                  onFocus={() => {
                    if (brandQuery.trim().length > 0)
                      setIsBrandDropdownOpen(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setIsBrandDropdownOpen(false), 150);
                  }}
                  placeholder="Type a brand (e.g., tylenol)"
                  autoComplete="off"
                  autoFocus
                  required
                />
                {isBrandDropdownOpen && (
                  <div className="autocomplete-dropdown">
                    {isLoadingSuggestions && (
                      <div className="autocomplete-item">Loading...</div>
                    )}

                    {!isLoadingSuggestions && suggestionsError && (
                      <div className="autocomplete-item">
                        {suggestionsError}
                      </div>
                    )}

                    {!isLoadingSuggestions &&
                      !suggestionsError &&
                      brandGroups.length === 0 && (
                        <div className="autocomplete-item">No matches</div>
                      )}

                    {!isLoadingSuggestions &&
                      !suggestionsError &&
                      brandGroups.map((g) => (
                        <button
                          key={g.label}
                          type="button"
                          className="autocomplete-item autocomplete-button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => chooseBrandGroup(g.label)}
                          disabled={g.label === "Keep typing..."}
                        >
                          {g.label}
                          {g.count > 0 ? ` (${g.count})` : ""}
                        </button>
                      ))}
                  </div>
                )}
              </label>

              <label className="modal-label">
                Product type
                <select
                  className="modal-input"
                  value={selectedProductId}
                  onChange={(e) => chooseProduct(e.target.value)}
                  disabled={!selectedBrand || productOptions.length === 0}
                  required
                >
                  <option value="">
                    {selectedBrand
                      ? productOptions.length
                        ? "Select a product"
                        : "No products found"
                      : "Select a brand first"}
                  </option>
                  {productOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                      {p.din ? ` (DIN ${p.din})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="modal-label">
                Dosage
                <input
                  className="modal-input"
                  name="dosage"
                  value={pillForm.dosage}
                  onChange={handleChange}
                  placeholder="e.g., 500 mg"
                  required
                />
              </label>

              <label className="modal-label">
                Times per day
                <div className="times-list">
                  {pillForm.takeTimes.map((t, idx) => (
                    <div key={idx} className="time-row">
                      <input
                        className="modal-input"
                        type="time"
                        value={t}
                        onChange={(e) => updateTimeAtIndex(idx, e.target.value)}
                        required={idx === 0}
                      />
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => removeTimeField(idx)}
                        aria-label="Remove time"
                        title="Remove time"
                      >
                        x
                      </button>
                    </div>

                    {userData?.linkedCaregivers?.length > 0 && (
                        <div className="linked-users">
                            <h3>My Caregivers</h3>
                            {userData.linkedCaregivers.map(cg => (
                                <div key={cg._id} className="linked-user-item">{cg.email}</div>
                            ))}
                        </div>
                    )}

                    {userData?.linkedPatients?.length > 0 && (
                        <div className="linked-users">
                            <h3>My Patients</h3>
                            {userData.linkedPatients.map(p => (
                                <div key={p._id} className="linked-user-item">{p.email}</div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="current-pills-section">
                    <h2>
                        Current Pills <span style={{ fontWeight: 500, fontSize: "0.95rem" }}>({totalPills} total)</span>
                    </h2>

                    <div className="pill-cards-container">
                        {currentPills.map(({ id, name, medicine, time, rawTimes, status }) => {
                            const clickable = true; // always clickable
                            const late = isLate(rawTimes);
                            return (
                                <div
                                    key={id}
                                    className={`pill-card clickable ${late ? "late" : ""}`}
                                    onClick={() => takePill(id, medicine, rawTimes)}
                                    title={late ? `Late by ${lateMinutes(rawTimes)} min` : "Click to take"}
                                    role="button"
                                    tabIndex={0}
                                >
                                    <div className="pill-header">
                                        <span className="medicine-name">{medicine}</span>
                                        <span className={`status-icon ${status}`}>
                                            {status === "taken" && "✔️"}
                                            {status === "missed" && "❌"}
                                            {status === "pending" && "⏳"}
                                        </span>
                                    </div>

                                    <div className="pill-details">
                                        <div className="person-name">{name}</div>
                                        <div className="pill-time">{time}</div>
                                    </div>
                                </div>
                            );
                        })}

                        <button type="button" className="pill-card add-card" onClick={() => setIsAddModalOpen(true)}>
                            <span className="plus-sign">＋</span>
                            <div>Add Pill</div>
                        </button>
                    </div>
                </section>

                <section className="notifications-section">
                    <h2>Notifications</h2>
                    {notifications.map(({ id, message, date }) => (
                        <div key={id} className="notification-item">
                            <div>{message}</div>
                            <small>{date}</small>
                        </div>
                    ))}
                </section>
            </main>

            {/* Link Modal */}
            {showLinkModal && (
                <div className="modal-overlay" onClick={() => setShowLinkModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3>Add {linkType === 'caregiver' ? 'Caregiver' : 'Patient'}</h3>
                        <p className="modal-hint">Enter their email to link</p>

                        <div className="search-box">
                            <input
                                type="email"
                                placeholder="Enter email..."
                                value={linkEmail}
                                onChange={(e) => setLinkEmail(e.target.value.toLowerCase())}
                            />
                            <button onClick={handleLink}>Link</button>
                        </div>

                        {error && <p className="error-message">{error}</p>}

                        <button className="close-btn" onClick={() => setShowLinkModal(false)}>Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Dashboard;
