# Sample Data Files

## Combined Format (email|password|secretKey|dataA|dataB|dataC|dataD)

account1@gmail.com|password1|secret1|data1@example.com|Company ABC Ltd|Dear [Name] congratulations on your achievement|Click here to claim your reward
account2@gmail.com|password2|secret2|data2@example.com|XYZ Corporation|Dear [Name] your verification is complete|Visit this link for next steps
account3@gmail.com|password3|secret3|data3@example.com|Tech Solutions Inc|Dear [Name] welcome to our program|Access your dashboard here

## Separated Format

### Accounts File (accounts.txt)
account1@gmail.com|password1|secret1
account2@gmail.com|password2|secret2
account3@gmail.com|password3|secret3

### Data File (data.csv) - for shared data across all accounts
Column A,Column B,Column C,Column D
data1@example.com,Company ABC Ltd,Dear [Name] congratulations,Click here to claim
data2@example.com,XYZ Corporation,Dear [Name] verification complete,Visit this link
data3@example.com,Tech Solutions Inc,Dear [Name] welcome,Access your dashboard

## Notes:
- In combined format, each account has its own specific data
- In separated format, all accounts share the same pool of data
- Use | (pipe) character to separate values in combined format
- Use comma to separate values in CSV data file for separated format
