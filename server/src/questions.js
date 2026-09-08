const q = (
  id,
  lang,
  title,
  description,
  inputFormat,
  starter,
  tests,
  hidden = [],
  bugs = [],
) => ({
  id,
  language: lang,
  title,
  description,
  inputFormat,
  starterCode: starter,
  publicTests: tests,
  hiddenTests: hidden,
  bugs,
  maxMarks: lang === "Java" ? 30 : 20,
});

const C = (id, title, desc, input, code, tests, hidden, bugs) =>
  q(id, "C", title, desc, input, code, tests, hidden, bugs);
const P = (id, title, desc, input, code, tests, hidden) =>
  q(id, "Python", title, desc, input, code, tests, hidden);
const J = (id, title, desc, input, code, tests, hidden) =>
  q(id, "Java", title, desc, input, code, tests, hidden);

export const QUESTIONS = [
  C(
    "C1",
    "Odd or Even Logic",
    "Read an integer and print Odd or Even.",
    "One integer",
    `#include <stdio.h>\nint main(){\n int n;\n printf("Enter number: ");\n scanf("%d", n);\n if(n % 2 = 0) printf("Even\\n");\n else printf("Odd\\n");\n return 0;\n}`,
    [
      ["8", "Even"],
      ["7", "Odd"],
    ],
    [
      ["0", "Even"],
      ["-5", "Odd"],
    ],
    [
      "scanf requires & operator for integer address",
      "Assignment operator '=' used inside if condition instead of '=='",
      "Print formatting issue with interactive prompts",
      "Return status code check",
      "Syntax issue in conditional expression",
      "Variable initialization issue",
    ],
  ),
  C(
    "C2",
    "Voter Eligibility",
    "A voter is eligible only when age is at least 18 AND citizen flag is 1. Print Eligible or Not Eligible.",
    "age citizenFlag",
    `#include <stdio.h>\nint main(){\n int age, citizen;\n scanf("%d %d", &age, &citizen);\n if(age > 18 || citizen = 1) printf("Eligible\\n");\n else printf("Not Eligible\\n");\n return 0;\n}`,
    [
      ["18 1", "Eligible"],
      ["20 0", "Not Eligible"],
    ],
    [
      ["17 1", "Not Eligible"],
      ["30 1", "Eligible"],
    ],
    [
      "Uses > instead of >= for age boundary",
      "Uses OR (||) instead of AND (&&)",
      "Assignment in condition (citizen = 1)",
      "Boundary condition handling for age 18",
      "Logical operator precedence defect",
      "Incorrect boolean condition structure",
    ],
  ),
  C(
    "C3",
    "Array – Find Maximum",
    "Read n followed by n integers, and print the maximum value in the array.",
    "n followed by n integers",
    `#include <stdio.h>\nint main(){\n int n, a[100], i, max;\n scanf("%d", &n);\n for(i=0; i<=n; i++) scanf("%d", &a[i]);\n max = 0;\n for(i=1; i<n; i++) if(a[i] < max) max = a[i];\n printf("%d\\n", max);\n return 0;\n}`,
    [
      ["5\n3 9 2 7 4", "9"],
      ["3\n-2 -5 -1", "-1"],
    ],
    [["4\n-10 -2 -8 -1", "-1"]],
    [
      "Loop reads past array bounds (i <= n)",
      "Initial max value set to 0 fails all-negative input",
      "Comparison operator reversed (< instead of >)",
      "Array indexing off-by-one",
      "Missing initial maximum from first element",
      "Loop bounds initialization bug",
    ],
  ),
  C(
    "C4",
    "Find Target Index",
    "Read n, n integers, and a target integer. Print the zero-based index of target, or -1 if not found.",
    "n, n integers, target",
    `#include <stdio.h>\nint main(){\n int n, a[100], target, i, idx = 0;\n scanf("%d", &n);\n for(i=0; i<n; i++) scanf("%d", &a[i]);\n scanf("%d", &target);\n for(i=0; i<n; i++){\n   if(a[i] = target){\n     idx = i;\n     break;\n   }\n }\n printf("%d\\n", idx);\n return 0;\n}`,
    [
      ["5\n2 4 7 4 9\n4", "1"],
      ["3\n1 2 3\n8", "-1"],
    ],
    [["4\n5 6 5 7\n5", "0"]],
    [
      "Default index initialized to 0 instead of -1",
      "Assignment operator = in if condition instead of ==",
      "Target not-found check breaks logic",
      "Loop break on assignment instead of match",
      "Incorrect return code format",
      "Array bounds safety defect",
    ],
  ),
  C(
    "C5",
    "Double Value Using Pointer",
    "Complete a pointer function to double an integer in place.",
    "One integer",
    `#include <stdio.h>\nvoid doubleValue(int *p){\n *p = *p / 2;\n}\nint main(){\n int n;\n scanf("%d", &n);\n doubleValue(n);\n printf("%d\\n", n);\n return 0;\n}`,
    [
      ["7", "14"],
      ["20", "40"],
    ],
    [
      ["0", "0"],
      ["-6", "-12"],
    ],
    [
      "Function divides value by 2 instead of multiplying by 2",
      "Passes integer value n to function instead of pointer &n",
      "Pointer dereference arithmetic error",
      "Incorrect pass-by-reference semantics",
      "Negative multiplier handling bug",
      "Type mismatch in function parameter pass",
    ],
  ),
  P(
    "P1",
    "Sum of Two Integers",
    "Read two integers from input and print their sum.",
    "Two lines of integers",
    `a = input()\nb = input()\nprint(a + c)`,
    [
      ["4\n5", "9"],
      ["10\n-2", "8"],
    ],
    [["100\n25", "125"]],
  ),
  P(
    "P2",
    "Pass or Fail Status",
    "Print Pass when mark is at least 40, otherwise Fail.",
    "One integer mark",
    `mark = input()\nif mark > 40:\n    print("Pass")\nelse:\n    print("Fail")`,
    [
      ["40", "Pass"],
      ["39", "Fail"],
    ],
    [["100", "Pass"]],
  ),
  P(
    "P3",
    "Sum of List Elements",
    "Read n and n integers, then print their sum.",
    "n then space-separated integers",
    `n = int(input())\nnums = input().split()\ntotal = 0\nfor i in range(1, n):\n    total += nums[i]\nprint(total)`,
    [
      ["4\n1 2 3 4", "10"],
      ["3\n5 5 5", "15"],
    ],
    [["1\n9", "9"]],
  ),
  P(
    "P4",
    "Find Index in List",
    "Read n, a list of n integers, and a target. Print first index of target, or -1 if not found.",
    "n, list, target",
    `n = int(input())\nnums = list(map(int, input().split()))\ntarget = int(input())\nprint(nums.index(target) + 1)`,
    [
      ["4\n5 8 3 8\n8", "1"],
      ["3\n1 2 3\n9", "-1"],
    ],
    [["5\n4 4 6 7 8\n4", "0"]],
  ),
  P(
    "P5",
    "Passed Students Count",
    "Read n student scores and print how many are 50 or above.",
    "n lines: name score",
    `n = int(input())\nscores = {}\nfor _ in range(n):\n    name, score = input().split()\n    scores[name] = score\ncount = 0\nfor name, score in scores.items():\n    if score > 50:\n        count += 1\nprint(count)`,
    [
      ["3\nA 60\nB 50\nC 40", "2"],
      ["2\nX 49\nY 51", "1"],
    ],
    [["4\nA 100\nB 50\nC 0\nD 75", "3"]],
  ),
  J(
    "J1",
    "Prime Number Logic",
    "Print Prime or Not Prime for an integer.",
    "One integer",
    `import java.util.*;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        boolean prime = true;\n        if (n < 2) prime = true;\n        for (int i = 2; i * i <= n; i++) {\n            if (n % i == 0) {\n                prime = false;\n                break;\n            }\n        }\n        System.out.println(prime ? "Prime" : "Not Prime");\n    }\n}`,
    [
      ["2", "Prime"],
      ["9", "Not Prime"],
    ],
    [
      ["1", "Not Prime"],
      ["97", "Prime"],
    ],
  ),
  J(
    "J2",
    "Electricity Billing System",
    "Units <= 100 at 1.5, 101-200 at 2.5, above 200 at 4.0. Print bill formatted to 2 decimals.",
    "One integer units",
    `import java.util.*;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner s = new Scanner(System.in);\n        int u = s.nextInt();\n        double b;\n        if (u <= 100) b = u * 1.5;\n        else if (u <= 200) b = (u - 100) * 2.5;\n        else b = 100 * 1.5 + 100 * 2.5 + (u - 200) * 4;\n        System.out.printf("%.2f\\n", b);\n    }\n}`,
    [
      ["100", "150.00"],
      ["150", "275.00"],
    ],
    [["250", "675.00"]],
  ),
  J(
    "J3",
    "Bank Management System",
    "Read balance, deposit, and withdrawal. If withdrawal exceeds updated balance print Insufficient else print final balance to 2 decimals.",
    "Three numbers: balance deposit withdrawal",
    `import java.util.*;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner s = new Scanner(System.in);\n        double bal = s.nextDouble();\n        double dep = s.nextDouble();\n        double wd = s.nextDouble();\n        if (wd > bal) {\n            System.out.println("Insufficient");\n        } else {\n            bal = bal - dep;\n            System.out.printf("%.2f\\n", bal - wd);\n        }\n    }\n}`,
    [
      ["1000 500 200", "1300.00"],
      ["500 0 600", "Insufficient"],
    ],
    [["100 100 50", "150.00"]],
  ),
];

export const QUESTION_MAP = new Map(QUESTIONS.map((x) => [x.id, x]));
