import matplotlib.pyplot as plt
import pandas as pd
import json
import time

def plot_trades():
    while True:
        try:
            with open("trades.json", "r") as f:
                trade_data = json.load(f)

            df = pd.DataFrame(trade_data)
            df["time"] = pd.to_datetime(df["time"])

            plt.figure(figsize=(12, 6))

            # Kereskedési pontok megjelenítése
            for i, row in df.iterrows():
                color = "green" if row["type"] == "buy" else "red"
                plt.scatter(row["time"], row["price"], color=color, marker="^" if row["type"] == "buy" else "v", s=100)

                plt.scatter(row["time"], row["stop_loss"], color="orange", marker="x", s=50, label="Stop-Loss" if i == 0 else "")
                plt.scatter(row["time"], row["take_profit"], color="blue", marker="x", s=50, label="Take-Profit" if i == 0 else "")

            plt.xlabel("Idő")
            plt.ylabel("Ár (USDC)")
            plt.title("Bitcoin RSI Trading - Kereskedési Pontok")
            plt.legend()
            plt.grid()
            plt.show()

            time.sleep(60)  # 1 percenként frissítés

        except Exception as e:
            print("Hiba a grafikon frissítésében:", e)
            time.sleep(10)

plot_trades()
