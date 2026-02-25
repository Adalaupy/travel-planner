import { useEffect, useState, useMemo } from "react";
import { useTrip } from "../context/TripContext";
import { ExpenseItem, TravelerItem } from "../lib/db";
import { getExpenses, getTravelers, getTrip, addExpense, deleteExpense } from "../lib/syncService";
import styles from "../styles/components.module.css";

type Props = { tripId?: number };

export const ExpensesManager = ({ tripId: _ }: Props = {}) => {
  const { trip } = useTrip();
  const tripId = trip?.trip_id || null;
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [travelers, setTravelers] = useState<TravelerItem[]>([]);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [payerId, setPayerId] = useState<string | undefined>();
  const [chargedTo, setChargedTo] = useState<string[]>([]);
  const [tripStartDate, setTripStartDate] = useState<string>("");
  const [date, setDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [expData, travData, tripData] = await Promise.all([
        getExpenses(tripId),
        getTravelers(tripId),
        getTrip(tripId || null as any),
      ]);
      if (mounted) {
        setExpenses(expData);
        setTravelers(travData);
        // Set trip start date and use it as default for expenses
        const startDate =
          (tripData as any)?.start_date || new Date().toISOString().split("T")[0];
        setTripStartDate(startDate);
        setDate(startDate);
        if (travData.length && !payerId) {
          const firstId = String(travData[0].__dexieid ?? travData[0].traveler_id);
          setPayerId(firstId);
          setChargedTo([firstId]);
        }
      }
    };
    load();

    // Poll for new travelers every 2 seconds
    const interval = setInterval(async () => {
      const travData = await getTravelers(tripId);
      if (mounted && travData.length !== travelers.length) {
        setTravelers(travData);
        if (travData.length && !payerId) {
          const firstId = String(travData[0].__dexieid ?? travData[0].traveler_id);
          setPayerId(firstId);
          setChargedTo([firstId]);
        }
      }
    }, 2000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [tripId, travelers.length, payerId]);

  // Auto-select payer when payer changes
  useEffect(() => {
    if (payerId) {
      setChargedTo([payerId]);
    }
  }, [payerId]);

  const addExpenseHandler = async () => {
    if (!tripId) {
      alert("Trip not loaded yet. Please try again.");
      return;
    }
    if (!title.trim()) {
      alert("Please enter a title.");
      return;
    }
    if (!amount) {
      alert("Please enter an amount.");
      return;
    }
    let resolvedPayerId = payerId;
    if (!resolvedPayerId && travelers.length) {
      resolvedPayerId = String(travelers[0].__dexieid ?? travelers[0].traveler_id);
      setPayerId(resolvedPayerId);
      setChargedTo([resolvedPayerId]);
    }
    if (!resolvedPayerId || resolvedPayerId === "undefined") {
      alert("Please add at least one traveler first.");
      return;
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return;
    const charged = chargedTo.length ? chargedTo : [resolvedPayerId];
    const exp = await addExpense(tripId, {
      title: title.trim(),
      amount: amt,
      payer_id: resolvedPayerId,
      charged_to: charged,
      datetime: date ? new Date(date).toISOString() : new Date().toISOString(),
    });
    if (exp) {
      setExpenses((prev) => [...prev, exp]);
      setTitle("");
      setAmount("");
      setChargedTo([resolvedPayerId]);
      setDate(tripStartDate);
    }
  };

  const removeExpenseHandler = async (id: number) => {
    const success = await deleteExpense(tripId, id);
    if (success) {
      setExpenses((prev) => prev.filter((e) => e.__dexieid !== id));
    }
  };

  const toggleCharged = (tId: string) => {
    setChargedTo((prev) =>
      prev.includes(tId) ? prev.filter((x) => x !== tId) : [...prev, tId],
    );
  };

  const selectAllCharged = () => {
    const allTravelers = travelers.map((t) => String(t.__dexieid ?? t.traveler_id));
    if (chargedTo.length === allTravelers.length) {
      setChargedTo([]);
    } else {
      setChargedTo(allTravelers);
    }
  };

  // Calculate balances: who paid vs who owes
  const calculateBalances = () => {
    const balances: Record<string, { paid: number; owe: number; net: number }> =
      {};
    travelers.forEach((t) => {
      const key = String(t.__dexieid ?? t.traveler_id);
      balances[key] = { paid: 0, owe: 0, net: 0 };
    });

    expenses.forEach((exp) => {
      const payer = exp.payer_id ? String(exp.payer_id) : null;
      if (payer && balances[payer]) balances[payer].paid += exp.amount;

      const charged = exp.charged_to || [];
      const share = charged.length ? exp.amount / charged.length : 0;
      charged.forEach((tId) => {
        const key = String(tId);
        if (balances[key]) balances[key].owe += share;
      });
    });

    Object.keys(balances).forEach((k) => {
      balances[k].net = balances[k].paid - balances[k].owe;
    });

    return balances;
  };

  const balances = calculateBalances();

  // Calculate suggested transfers to settle balances
  const calculateSettlements = () => {
    const settlements: { from: string; to: string; amount: number }[] = [];
    const creditors: { id: string; name: string; amount: number }[] = [];
    const debtors: { id: string; name: string; amount: number }[] = [];

    travelers.forEach((t) => {
      const key = String(t.__dexieid ?? t.traveler_id);
      const bal = balances[key];
      if (bal.net > 0.01) {
        creditors.push({ id: String(t.__dexieid ?? t.traveler_id), name: t.name, amount: bal.net });
      } else if (bal.net < -0.01) {
        debtors.push({ id: String(t.__dexieid ?? t.traveler_id), name: t.name, amount: -bal.net });
      }
    });

    // Sort by amount (largest first)
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    let i = 0,
      j = 0;
    while (i < creditors.length && j < debtors.length) {
      const creditor = creditors[i];
      const debtor = debtors[j];
      const transferAmount = Math.min(creditor.amount, debtor.amount);

      settlements.push({
        from: debtor.name,
        to: creditor.name,
        amount: transferAmount,
      });

      creditor.amount -= transferAmount;
      debtor.amount -= transferAmount;

      if (creditor.amount < 0.01) i++;
      if (debtor.amount < 0.01) j++;
    }

    return settlements;
  };

  const settlementsTravelers = useMemo(() => {
    return travelers.map((t) => ({
      id: String(t.__dexieid ?? t.traveler_id),
      name: t.name,
    }));
  }, [travelers]);

  const settlementsBalances = useMemo(() => calculateBalances(), [travelers, expenses]);

  return (
    <div className={styles.expensesContainer}>
      <h2>Expenses</h2>

      <div className={styles.addExpenseRow}>
        <input
          placeholder="Event/Description"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          type="number"
          step="0.01"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <select
          value={payerId || ""}
          onChange={(e) => setPayerId(e.target.value)}
        >
          {travelers.map((t) => (
            <option key={String(t.__dexieid ?? t.traveler_id)} value={String(t.__dexieid ?? t.traveler_id)}>
              {t.name}
            </option>
          ))}
        </select>
        <div className={styles.chargedToRow}>
          <div style={{ marginBottom: 4}}>
            <label>Charged to (defaults to payer):</label>
          </div>
          <div className={styles.chargedToList}>
            <div style={{display:"flex", gap:'15px', flexWrap:'wrap', padding: '0 20px', justifyContent:'center', }}>
              {travelers.map((t) => (
                <label key={String(t.__dexieid ?? t.traveler_id)} className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={chargedTo.includes(String(t.__dexieid ?? t.traveler_id))}
                    onChange={() => toggleCharged(String(t.__dexieid ?? t.traveler_id))}
                  />
                  {t.name}
                </label>
              ))}
            </div>
            <div style={{display: 'flex', justifyContent:'center'}}>
              <button
                type="button"
                className={styles.selectAllBtn}
                onClick={selectAllCharged}
              >
                {chargedTo.length === travelers.length
                  ? "Unselect All"
                  : "Select All"}
              </button>
            </div>
          </div>
        </div>
        <div
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "end",
            marginTop: "20px",
          }}
        >
          <button onClick={addExpenseHandler}>Add</button>
        </div>
      </div>

      <ul className={styles.expensesList}>
        {expenses.map((exp) => {
          const payer = travelers.find(
            (t) => String(t.__dexieid ?? t.traveler_id) === String(exp.payer_id),
          );
          const charged =
            exp.charged_to
              ?.map((id) =>
                travelers.find((t) => String(t.__dexieid ?? t.traveler_id) === String(id))?.name,
              )
              .filter(Boolean)
              .join(", ") || "All";
          const expDate = exp.datetime
            ? new Date(exp.datetime).toLocaleDateString()
            : "";
          return (
            <li key={exp.__dexieid} className={styles.expenseItem}>
              <div className={styles.expenseInfo}>
                <div className={styles.expenseTitle}>{exp.title}</div>
                <div className={styles.expenseMeta}>
                  ${exp.amount.toFixed(2)} • {expDate} • Paid by{" "}
                  {payer?.name || "Unknown"} • Charged to: {charged}
                </div>
              </div>
              <button
                className={styles.deleteBtn}
                onClick={() => removeExpenseHandler(exp.__dexieid!)}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>

      <div className={styles.balancesSection}>
        <h3>Balances</h3>
        <ul className={styles.balancesList}>
          {travelers.map((t) => {
            const key = String(t.__dexieid ?? t.traveler_id);
            const bal = settlementsBalances[key];
            const netStr =
              bal && bal.net >= 0
                ? ` +$${bal.net.toFixed(2)}`
                : bal ? ` -$${Math.abs(bal.net).toFixed(2)}` : " $0.00";
            const netColor = bal && bal.net > 0 ? 'green' : 'red'

            return (
              <li key={t.__dexieid} className={styles.balanceItem}>
                <span className={styles.balanceName}>{t.name}</span>
                <span className={styles.balanceDetails}>
                  Paid: ${bal?.paid.toFixed(2) || "0.00"}  |  Owe: ${bal?.owe.toFixed(2) || "0.00"}  |  Net:  <strong style={{color: netColor}}>{netStr}</strong>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {calculateSettlements().length > 0 && (
        <div className={styles.settlementsSection}>
          <h3>Suggested Transfers to Settle Up</h3>
          <ul className={styles.settlementsList}>
            {calculateSettlements().map((s, idx) => (
              <li key={idx} className={styles.settlementItem}>
                <strong>{s.from}</strong> pays <strong>{s.to}</strong>:{" "}
                <span className={styles.settlementAmount}>
                  ${s.amount.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ExpensesManager;
