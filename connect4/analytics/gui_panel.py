"""Optional Tkinter panel. Benchmark runs off the UI thread; UI updates use after()."""
import threading, queue
from pathlib import Path
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from .benchmark import run_benchmark
from .analyze import analyze

class BenchmarkPanel(ttk.Frame):
    def __init__(self, master, **kwargs):
        super().__init__(master, **kwargs); self.events=queue.Queue(); self.worker=None
        self.csv=tk.StringVar(); self.depth=tk.IntVar(value=4); self.status=tk.StringVar(value="Choose the benchmark scenario CSV.")
        ttk.Label(self,text="AI Performance & Data Science").pack(anchor="w",pady=6)
        row=ttk.Frame(self); row.pack(fill="x")
        ttk.Entry(row,textvariable=self.csv).pack(side="left",fill="x",expand=True)
        ttk.Button(row,text="Browse",command=self._browse).pack(side="left",padx=5)
        controls=ttk.Frame(self); controls.pack(fill="x",pady=6)
        ttk.Label(controls,text="Search depth:").pack(side="left"); ttk.Spinbox(controls,from_=1,to=8,textvariable=self.depth,width=5).pack(side="left",padx=5)
        self.run_button=ttk.Button(controls,text="Run paired benchmark",command=self._start); self.run_button.pack(side="left",padx=5)
        ttk.Label(self,textvariable=self.status).pack(anchor="w",pady=4)
        self.progress=ttk.Progressbar(self,mode="determinate"); self.progress.pack(fill="x")
        self.output=tk.Text(self,height=12,width=80,state="disabled"); self.output.pack(fill="both",expand=True,pady=6)
        self.after(100,self._poll)
    def _browse(self):
        path=filedialog.askopenfilename(filetypes=[("CSV files","*.csv")]);
        if path: self.csv.set(path)
    def _start(self):
        if not self.csv.get() or not Path(self.csv.get()).is_file(): messagebox.showerror("Dataset required","Choose a valid CSV file."); return
        if self.worker and self.worker.is_alive(): return
        self.run_button.configure(state="disabled"); self.progress.configure(value=0,maximum=1); self.status.set("Running actual Minimax and Alpha-Beta searches…")
        def work():
            try:
                target=Path(self.csv.get()).resolve().parent/"benchmark_results.csv"
                result=run_benchmark(self.csv.get(),target,int(self.depth.get()),lambda done,total,sid:self.events.put(("progress",done,total,sid)))
                _,_,insights=analyze(target,target.parent/"analysis_output")
                self.events.put(("done",str(target),len(result),insights))
            except Exception as exc: self.events.put(("error",str(exc)))
        self.worker=threading.Thread(target=work,daemon=True); self.worker.start()
    def _poll(self):
        try:
            while True:
                event=self.events.get_nowait()
                if event[0]=="progress":
                    _,done,total,sid=event; self.progress.configure(maximum=total,value=done); self.status.set(f"Completed {done}/{total}: {sid}")
                elif event[0]=="done":
                    _,path,count,insights=event; self.run_button.configure(state="normal"); self.status.set(f"Finished: {count} paired scenarios")
                    self.output.configure(state="normal"); self.output.delete("1.0","end"); self.output.insert("end",f"Results saved to: {path}\n\n"+"\n".join(insights)); self.output.configure(state="disabled")
                elif event[0]=="error":
                    self.run_button.configure(state="normal"); self.status.set("Benchmark failed"); messagebox.showerror("Benchmark error",event[1])
        except queue.Empty: pass
        self.after(100,self._poll)
