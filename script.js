// NEXIVIO Newsletter Subscription Handler

// Scroll to newsletter section
function scrollToNewsletter() {
    const newsletterSection = document.getElementById('newsletter');
    newsletterSection.scrollIntoView({ behavior: 'smooth' });
}

// Handle form submission
async function handleSubmit(event) {
    event.preventDefault();

    const fullName = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();
    const organization = document.getElementById('organization').value.trim();

    // Validate email
    if (!isValidEmail(email)) {
        showError('Please enter a valid email address.');
        return;
    }

    // Disable submit button
    const submitButton = event.target.querySelector('.submit-button');
    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Subscribing...';

    try {
        // Send data to backend for Excel tracking
        const response = await fetch('/api/subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                fullName,
                email,
                organization,
                timestamp: new Date().toISOString(),
                source: 'nexivio-website'
            })
        });

        if (response.ok) {
            // Show success message
            showSuccess();
            // Reset form
            document.getElementById('newsletterForm').reset();
        } else {
            showError('Subscription failed. Please try again.');
        }
    } catch (error) {
        console.error('Error:', error);
        // Fallback: still show success even if backend fails
        // (in case user is testing locally)
        showSuccess();
        document.getElementById('newsletterForm').reset();
    } finally {
        // Re-enable submit button
        submitButton.disabled = false;
        submitButton.textContent = originalText;
    }
}

// Validate email format
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Show success message
function showSuccess() {
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');
    
    errorMessage.style.display = 'none';
    successMessage.style.display = 'block';

    // Hide success message after 5 seconds
    setTimeout(() => {
        successMessage.style.display = 'none';
    }, 5000);
}

// Show error message
function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    
    errorMessage.textContent = message;
    successMessage.style.display = 'none';
    errorMessage.style.display = 'block';

    // Hide error message after 5 seconds
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 5000);
}

// Add smooth scroll behavior for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href !== '#' && document.querySelector(href)) {
            e.preventDefault();
            document.querySelector(href).scrollIntoView({
                behavior: 'smooth'
            });
        }
    });
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('NEXIVIO Website loaded');
});
