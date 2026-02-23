import React, { useEffect, useState } from "react";
import { db, ExpenseItem, TravelerItem } from "../lib/db";
import styles from "../styles/components.module.css";

type Props = { tripId: number };

export const ExpensesManager: React.FC<Props> = ({ tripId }) => {
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [travelers, setTravelers] = useState<TravelerItem[]>([]);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [payerId, setPayerId] = useState<number | undefined>();
  const [chargedTo, setChargedTo] = useState<number[]>([]);
  const [tripStartDate, setTripStartDate] = useState<string>("");
  const [date, setDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [expData, travData, tripData] = await Promise.all([
        db.expenses.where("Trip_ID").equals(tripId).toArray(),
        db.travelers.where("Trip_ID").equals(tripId).toArray(),
        db.trips.get(tripId),
      ]);
      if (mounted) {
        setExpenses(expData);
        setTravelers(travData);
        // Set trip start date and use it as default for expenses
        const startDate =
          tripData?.startDate || new Date().toISOString().split("T")[0];
        setTripStartDate(startDate);
        setDate(startDate);
        if (travData.length && !payerId) {
          const firstId = travData[0].Traveler_ID!;
          setPayerId(firstId);
          setChargedTo([firstId]);
        }
      }
    };
    load();

    // Poll for new travelers every 2 seconds
    const interval = setInterval(async () => {
      const travData = await db.travelers
        .where("Trip_ID")
        .equals(tripId)
        .toArray();
      if (mounted && travData.length !== travelers.length) {
        setTravelers(travData);
        if (travData.length && !payerId) {
          const firstId = travData[0].Traveler_ID!;
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

  const addExpense = async () => {
    if (!title.trim() || !amount || !payerId) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return;
    const charged = chargedTo.length
      ? chargedTo
      : travelers.map((t) => t.Traveler_ID!);
    const id = await db.expenses.add({
      Trip_ID: tripId,
      title: title.trim(),
      amount: amt,
      payer_ID: payerId,
      chargedTo: charged,
      datetime: date ? new Date(date).toISOString() : new Date().toISOString(),
    });
    const exp = await db.expenses.get(id);
    setExpenses((prev) => [...prev, exp as ExpenseItem]);
    setTitle("");
    setAmount("");
    setChargedTo([]);
    setDate(tripStartDate);
  };

  const removeExpense = async (id: number) => {
    await db.expenses.delete(id);
    setExpenses((prev) => prev.filter((e) => e.Expense_ID !== id));
  };

  const toggleCharged = (tId: number) => {
    setChargedTo((prev) =>
      prev.includes(tId) ? prev.filter((x) => x !== tId) : [...prev, tId],
    );
  };

  const selectAllCharged = () => {
    const allTravelers = travelers.map((t) => t.Traveler_ID!);
    if (chargedTo.length === allTravelers.length) {
      setChargedTo([]);
    } else {
      setChargedTo(allTravelers);
    }
  };

  // Calculate balances: who paid vs who owes
  const calculateBalances = () => {
    const balances: Record<number, { paid: number; owe: number; net: number }> =
      {};
    travelers.forEach((t) => {
      balances[t.Traveler_ID!] = { paid: 0, owe: 0, net: 0 };
    });

    expenses.forEach((exp) => {
      const payer = exp.payer_ID;
      if (payer && balances[payer]) balances[payer].paid += exp.amount;

      const charged = exp.chargedTo || [];
      const share = charged.length ? exp.amount / charged.length : 0;
      charged.forEach((tId) => {
        if (balances[tId]) balances[tId].owe += share;
      });
    });

    Object.keys(balances).forEach((k) => {
      const id = Number(k);
      balances[id].net = balances[id].paid - balances[id].owe;
    });

    return balances;
  };

  const balances = calculateBalances();

  // Calculate suggested transfers to settle balances
  const calculateSettlements = () => {
    const settlements: { from: string; to: string; amount: number }[] = [];
    const creditors: { id: number; name: string; amount: number }[] = [];
    const debtors: { id: number; name: string; amount: number }[] = [];

    travelers.forEach((t) => {
      const bal = balances[t.Traveler_ID!];
      if (bal.net > 0.01) {
        creditors.push({ id: t.Traveler_ID!, name: t.name, amount: bal.net });
      } else if (bal.net < -0.01) {
        debtors.push({ id: t.Traveler_ID!, name: t.name, amount: -bal.net });
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

  const settlements = calculateSettlements();

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
          onChange={(e) => setPayerId(Number(e.target.value))}
        >
          {travelers.map((t) => (
            <option key={t.Traveler_ID} value={t.Traveler_ID}>
              {t.name}
            </option>
          ))}
        </select>
        <div className={styles.chargedToRow}>
          <div style={{ marginBottom: 4 }}>
            <label>Charged to (leave empty for all):</label>
          </div>
          <div className={styles.chargedToList}>
            {travelers.map((t) => (
              <label key={t.Traveler_ID} className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={chargedTo.includes(t.Traveler_ID!)}
                  onChange={() => toggleCharged(t.Traveler_ID!)}
                />
                {t.name}
              </label>
            ))}
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
        <div
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "center",
            marginTop: "20px",
          }}
        >
          <button onClick={addExpense}>Add</button>
        </div>
      </div>

      <ul className={styles.expensesList}>
        {expenses.map((exp) => {
          const payer = travelers.find((t) => t.Traveler_ID === exp.payer_ID);
          const charged =
            exp.chargedTo
              ?.map((id) => travelers.find((t) => t.Traveler_ID === id)?.name)
              .filter(Boolean)
              .join(", ") || "All";
          const expDate = exp.datetime
            ? new Date(exp.datetime).toLocaleDateString()
            : "";
          return (
            <li key={exp.Expense_ID} className={styles.expenseItem}>
              <div className={styles.expenseInfo}>
                <div className={styles.expenseTitle}>{exp.title}</div>
                <div className={styles.expenseMeta}>
                  ${exp.amount.toFixed(2)} • {expDate} • Paid by{" "}
                  {payer?.name || "Unknown"} • Charged to: {charged}
                </div>
              </div>
              <button
                className={styles.deleteBtn}
                onClick={() => removeExpense(exp.Expense_ID!)}
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
            const bal = balances[t.Traveler_ID!];
            const netStr =
              bal.net >= 0
                ? ` +$${bal.net.toFixed(2)}`
                : ` -$${Math.abs(bal.net).toFixed(1)}`;
            const netColor = bal.net > 0 ? 'green' : 'red'

            return (
              <li key={t.Traveler_ID} className={styles.balanceItem}>
                <span className={styles.balanceName}>{t.name}</span>
                <span className={styles.balanceDetails}>
                  Paid: ${bal.paid.toFixed(2)}  |  Owe: ${bal.owe.toFixed(2)}  |  Net:  <strong style={{color: netColor}}>{netStr}</strong>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {settlements.length > 0 && (
        <div className={styles.settlementsSection}>
          <h3>Suggested Transfers to Settle Up</h3>
          <ul className={styles.settlementsList}>
            {settlements.map((s, idx) => (
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
