import pandas as pd
import os

# Input file
input_file = "Dataset.xlsx"

# Read Excel file
df = pd.read_excel(input_file)

# Keep only first 10 rows
df_first_10 = df.head(10)

# Create new file name
file_name, file_ext = os.path.splitext(input_file)
output_file = f"{file_name}_first_10_rows{file_ext}"

# Save as a new file
df_first_10.to_excel(output_file, index=False)

print(f"New file created: {output_file}")