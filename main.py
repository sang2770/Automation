import undetected_chromedriver as uc
import pyotp
import time
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from selenium.webdriver.common.keys import Keys
import random

def get_2fa_code(secret_key):
    try:
        totp = pyotp.TOTP(secret_key.replace(' ', ''))
        token = totp.now()
        print(f"Generated 2FA code: {token}")
        return token
    except Exception as e:
        print(f"Lỗi khi tạo mã 2FA: {repr(e)}")
        return None

def human_delay(min_delay=1, max_delay=3):
    """Add random delay to simulate human behavior"""
    time.sleep(random.uniform(min_delay, max_delay))

def type_like_human(element, text, delay=0.1):
    """Type text with human-like delays"""
    for char in text:
        element.send_keys(char)
        time.sleep(random.uniform(0.05, delay))

def login_and_create_sheet(email, password, secret_key):
    options = uc.ChromeOptions()
    
    # Stealth options
    options.add_argument("--no-first-run")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-sandbox")
    
    try:
        driver = uc.Chrome(options=options, version_main=None)
        wait = WebDriverWait(driver, 20)
        
        # Execute script to hide automation
        driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        
        print("🚀 Starting login process...")
        
        # Navigate to Google Sheets directly
        driver.get("https://docs.google.com/spreadsheets")
        human_delay(3, 5)
        
        # Login process
        try:
            # Enter email
            print("📧 Entering email...")
            email_input = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, 'input[type="email"]')))
            email_input.clear()
            type_like_human(email_input, email)
            human_delay()
            
            # Click Next
            next_button = driver.find_element(By.ID, "identifierNext")
            next_button.click()
            human_delay(2, 4)
            
            # Enter password
            print("🔐 Entering password...")
            password_input = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, 'input[type="password"]')))
            password_input.clear()
            type_like_human(password_input, password)
            human_delay()
            
            # Click password Next
            password_next = driver.find_element(By.ID, "passwordNext")
            password_next.click()
            human_delay(3, 6)
            
            # Handle 2FA if required
            try:
                print("🔒 Checking for 2FA...")
                totp_selectors = [
                    'input[type="tel"]',
                    '[data-testid="totpPin"]',
                    'input[aria-label*="code"]',
                    'input[placeholder*="code"]',
                    '#totpPin'
                ]
                
                totp_input = None
                for selector in totp_selectors:
                    try:
                        totp_input = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, selector)))
                        print(f"Found 2FA input: {selector}")
                        break
                    except TimeoutException:
                        continue
                
                if totp_input:
                    print("🔢 Entering 2FA code...")
                    code = get_2fa_code(secret_key)
                    if code:
                        totp_input.clear()
                        type_like_human(totp_input, code)
                        human_delay()
                        
                        # Click 2FA next button
                        next_buttons = ['#totpNext', 'button[type="submit"]']
                        for button_selector in next_buttons:
                            try:
                                next_btn = driver.find_element(By.CSS_SELECTOR, button_selector)
                                next_btn.click()
                                break
                            except NoSuchElementException:
                                continue
                        
                        human_delay(3, 5)
            except TimeoutException:
                print("✅ No 2FA required")
        
        except Exception as login_error:
            print(f"❌ Login failed: {login_error}")
            # If already on sheets page, might already be logged in
            if "docs.google.com/spreadsheets" in driver.current_url:
                print("✅ Already on Google Sheets page")
            else:
                return
        
        # Wait for Google Sheets to load
        print("📊 Waiting for Google Sheets to load...")
        try:
            # Wait for either the main sheets page or redirect completion
            WebDriverWait(driver, 30).until(
                lambda d: "docs.google.com/spreadsheets" in d.current_url or 
                          d.find_elements(By.CSS_SELECTOR, '[data-testid], .docs-homescreen, .waffle')
            )
        except TimeoutException:
            print("⚠️ Timeout waiting for sheets page, continuing anyway...")
        
        human_delay(2, 4)
        
        # Create new sheet
        print("📝 Creating new sheet...")
        driver.get("https://docs.google.com/spreadsheets/create")
        
        # Wait for new sheet to load
        print("⏳ Waiting for new sheet to load...")
        try:
            wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, '.waffle, .grid-container, [role="grid"]')))
            print("✅ New sheet loaded successfully!")
        except TimeoutException:
            print("⚠️ Sheet may not have loaded properly, continuing...")
        
        human_delay(2, 3)
        
        # Fill sample data
        print("📊 Filling sample data...")
        fill_sample_data(driver)
        
        print("🎉 Process completed! Sheet created and filled with sample data.")
        input("Press Enter to close the browser...")
        
    except Exception as e:
        print(f"❌ Error: {repr(e)}")
        try:
            driver.save_screenshot("error_screenshot.png")
            print("📸 Screenshot saved as error_screenshot.png")
        except:
            pass
    
    finally:
        try:
            driver.quit()
        except:
            pass

def fill_sample_data(driver):
    """Fill the sheet with sample data"""
    sample_data = [
        ["Name", "Age", "Department", "Salary", "Join Date"],
        ["John Doe", "28", "Engineering", "75000", "2023-01-15"],
        ["Jane Smith", "32", "Marketing", "68000", "2022-03-20"],
        ["Mike Johnson", "45", "Sales", "72000", "2021-07-10"],
        ["Sarah Wilson", "29", "HR", "65000", "2023-02-28"],
        ["David Brown", "35", "Engineering", "82000", "2020-11-05"],
        ["Lisa Davis", "31", "Marketing", "70000", "2022-08-12"],
        ["Tom Miller", "38", "Sales", "78000", "2021-12-01"],
        ["Amy Garcia", "26", "HR", "62000", "2023-04-18"],
        ["Chris Lee", "33", "Engineering", "85000", "2020-09-22"],
        ["Emma Taylor", "27", "Marketing", "67000", "2023-01-30"]
    ]
    
    try:
        # Click on cell A1 to start
        cell_a1 = driver.find_element(By.CSS_SELECTOR, '[role="gridcell"][aria-label*="A1"], .waffle-cell, input.waffle-cell-editor')
        cell_a1.click()
        human_delay()
        
        # Fill data row by row
        for row_idx, row_data in enumerate(sample_data):
            for col_idx, cell_data in enumerate(row_data):
                try:
                    # Calculate cell position
                    col_letter = chr(65 + col_idx)  # A, B, C, etc.
                    row_num = row_idx + 1
                    
                    # Try to find and click the specific cell
                    cell_selectors = [
                        f'[aria-label*="{col_letter}{row_num}"]',
                        f'[data-sheet-coord="{col_letter}{row_num}"]',
                        '.waffle-cell'
                    ]
                    
                    cell_found = False
                    for selector in cell_selectors:
                        try:
                            cells = driver.find_elements(By.CSS_SELECTOR, selector)
                            if cells:
                                target_cell = cells[0] if len(cells) == 1 else cells[row_idx * len(row_data) + col_idx] if len(cells) > row_idx * len(row_data) + col_idx else cells[0]
                                target_cell.click()
                                cell_found = True
                                break
                        except:
                            continue
                    
                    if cell_found:
                        # Type the data
                        active_element = driver.switch_to.active_element
                        active_element.clear()
                        type_like_human(active_element, str(cell_data), 0.05)
                        
                        # Press Tab to move to next cell (or Enter for last column)
                        if col_idx < len(row_data) - 1:
                            active_element.send_keys(Keys.TAB)
                        else:
                            active_element.send_keys(Keys.ENTER)
                        
                        time.sleep(0.2)
                    
                except Exception as cell_error:
                    print(f"⚠️ Error filling cell {col_letter}{row_num}: {cell_error}")
                    continue
            
            print(f"✅ Filled row {row_idx + 1}")
            human_delay(0.5, 1)
        
        # Format header row (make it bold)
        try:
            print("🎨 Formatting header row...")
            # Select header row (A1:E1)
            header_range = driver.find_element(By.CSS_SELECTOR, '[aria-label*="A1"]')
            header_range.click()
            
            # Drag to select the entire header row
            driver.execute_script("""
                var event = new KeyboardEvent('keydown', {
                    key: 'B',
                    ctrlKey: true,
                    bubbles: true
                });
                document.activeElement.dispatchEvent(event);
            """)
            
        except Exception as format_error:
            print(f"⚠️ Could not format header: {format_error}")
        
        print("✅ Sample data filled successfully!")
        
    except Exception as e:
        print(f"❌ Error filling data: {repr(e)}")
        
        # Fallback: try simple text input
        try:
            print("🔄 Trying fallback method...")
            body = driver.find_element(By.TAG_NAME, 'body')
            
            # Just type the first row as a test
            for i, cell_data in enumerate(sample_data[0]):
                body.send_keys(cell_data)
                if i < len(sample_data[0]) - 1:
                    body.send_keys(Keys.TAB)
                human_delay(0.3, 0.5)
            
        except Exception as fallback_error:
            print(f"❌ Fallback also failed: {fallback_error}")

if __name__ == "__main__":
    email = "beaufortperrowzj77@gmail.com"
    password = "wsk37ptqg"
    secret_key = "7p6ygtmgel6d2jy2ymvkj3r6odhlh6hp"
    
    print("🚀 Starting Google Sheets automation...")
    login_and_create_sheet(email, password, secret_key)