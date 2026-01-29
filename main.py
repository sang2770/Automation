import undetected_chromedriver as uc
import pyotp
import time
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
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
    # options.add_argument("--no-first-run")
    options.add_argument("--disable-blink-features=AutomationControlled")
    # options.add_argument("--disable-dev-shm-usage")
    # options.add_argument("--no-sandbox")
    
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
        #  Create gg app scripts
        # id="docs-extensions-menu"
        open_script_menu = wait.until(EC.element_to_be_clickable((By.ID, "docs-extensions-menu")))
        open_script_menu.click()

        apps_script_option = driver.find_element(By.XPATH, '//div[text()="Apps Script"]')
        apps_script_option.click()
        
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

if __name__ == "__main__":
    email = "beaufortperrowzj77@gmail.com"
    password = "wsk37ptqg"
    secret_key = "7p6ygtmgel6d2jy2ymvkj3r6odhlh6hp"
    
    print("🚀 Starting Google Sheets automation...")
    login_and_create_sheet(email, password, secret_key)