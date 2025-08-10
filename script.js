// Okha.ai Website JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Mobile menu toggle
    const mobileMenu = document.querySelector('.mobile-menu');
    const navLinks = document.querySelector('.nav-links');
    
    if (mobileMenu && navLinks) {
        // Toggle mobile menu
        mobileMenu.addEventListener('click', function(e) {
            e.preventDefault();
            navLinks.classList.toggle('active');
            
            // Update hamburger icon (optional visual feedback)
            if (navLinks.classList.contains('active')) {
                mobileMenu.setAttribute('aria-expanded', 'true');
            } else {
                mobileMenu.setAttribute('aria-expanded', 'false');
            }
        });
        
        // Close mobile menu when clicking on links
        const navMenuLinks = navLinks.querySelectorAll('a');
        navMenuLinks.forEach(link => {
            link.addEventListener('click', function() {
                navLinks.classList.remove('active');
                mobileMenu.setAttribute('aria-expanded', 'false');
            });
        });
        
        // Close mobile menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!mobileMenu.contains(e.target) && !navLinks.contains(e.target)) {
                navLinks.classList.remove('active');
                mobileMenu.setAttribute('aria-expanded', 'false');
            }
        });
        
        // Close mobile menu on window resize (if screen gets bigger)
        window.addEventListener('resize', function() {
            if (window.innerWidth > 768) {
                navLinks.classList.remove('active');
                mobileMenu.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // Header scroll effect
    const header = document.querySelector('header');
    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    // Animate elements on scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
            }
        });
    }, observerOptions);

    // Add animation classes to elements
    document.querySelectorAll('.feature-card, .testimonial, .pricing-card').forEach(el => {
        el.classList.add('animate-on-scroll');
        observer.observe(el);
    });

    // Form handling
    const auditForm = document.getElementById('auditForm');
    if (auditForm) {
        auditForm.addEventListener('submit', handleFormSubmit);
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });

    // Form validation
    const formInputs = document.querySelectorAll('input[required], select[required], textarea[required]');
    formInputs.forEach(input => {
        input.addEventListener('blur', validateField);
        input.addEventListener('input', clearErrors);
    });
});

function handleFormSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    // Show loading state
    showLoading();
    
    // Validate form
    if (!validateForm(form)) {
        hideLoading();
        showError('Please fill in all required fields correctly.');
        return;
    }
    
    // Convert FormData to object
    const data = {};
    formData.forEach((value, key) => {
        data[key] = value;
    });
    
    // Add timestamp
    data.timestamp = new Date().toISOString();
    data.userAgent = navigator.userAgent;
    data.referrer = document.referrer;
    
    // Simulate API call (replace with actual endpoint)
    submitAuditRequest(data)
        .then(response => {
            hideLoading();
            if (response.success) {
                // Redirect to thank you page
                window.location.href = 'thank-you.html?submitted=true';
            } else {
                showError('There was an issue submitting your request. Please try again.');
            }
        })
        .catch(error => {
            hideLoading();
            console.error('Form submission error:', error);
            showError('There was an issue submitting your request. Please try again.');
        });
}

function validateForm(form) {
    let isValid = true;
    const requiredFields = form.querySelectorAll('input[required], select[required], textarea[required]');
    
    requiredFields.forEach(field => {
        if (!validateField({ target: field })) {
            isValid = false;
        }
    });
    
    // Additional validations
    const email = form.querySelector('input[type="email"]');
    if (email && email.value && !isValidEmail(email.value)) {
        showFieldError(email, 'Please enter a valid email address.');
        isValid = false;
    }
    
    const website = form.querySelector('input[name="website"]');
    if (website && website.value && !isValidWebsite(website.value)) {
        showFieldError(website, 'Please enter a valid website URL.');
        isValid = false;
    }
    
    return isValid;
}

function validateField(e) {
    const field = e.target;
    const value = field.value.trim();
    
    // Clear previous errors
    clearFieldError(field);
    
    if (field.hasAttribute('required') && !value) {
        showFieldError(field, 'This field is required.');
        return false;
    }
    
    if (field.type === 'email' && value && !isValidEmail(value)) {
        showFieldError(field, 'Please enter a valid email address.');
        return false;
    }
    
    if (field.name === 'website' && value && !isValidWebsite(value)) {
        showFieldError(field, 'Please enter a valid website URL.');
        return false;
    }
    
    return true;
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isValidWebsite(website) {
    try {
        // Add protocol if missing
        let url = website;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

function showFieldError(field, message) {
    clearFieldError(field);
    
    field.classList.add('error');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'field-error';
    errorDiv.textContent = message;
    errorDiv.style.color = '#e74c3c';
    errorDiv.style.fontSize = '0.9rem';
    errorDiv.style.marginTop = '0.25rem';
    
    field.parentNode.appendChild(errorDiv);
}

function clearFieldError(field) {
    field.classList.remove('error');
    const existingError = field.parentNode.querySelector('.field-error');
    if (existingError) {
        existingError.remove();
    }
}

function clearErrors(e) {
    clearFieldError(e.target);
    hideError();
}

function showLoading() {
    const loading = document.querySelector('.loading');
    const submitBtn = document.querySelector('button[type="submit"]');
    
    if (loading) {
        loading.style.display = 'block';
    }
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="spinner"></div> Submitting...';
    }
}

function hideLoading() {
    const loading = document.querySelector('.loading');
    const submitBtn = document.querySelector('button[type="submit"]');
    
    if (loading) {
        loading.style.display = 'none';
    }
    
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Get My Free Website Audit';
    }
}

function showError(message) {
    const errorDiv = document.querySelector('.error-message');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        errorDiv.scrollIntoView({ behavior: 'smooth' });
    }
}

function hideError() {
    const errorDiv = document.querySelector('.error-message');
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
}

function showSuccess(message) {
    const successDiv = document.querySelector('.success-message');
    if (successDiv) {
        successDiv.textContent = message;
        successDiv.style.display = 'block';
        successDiv.scrollIntoView({ behavior: 'smooth' });
    }
}

// Simulate API call - replace with actual implementation
async function submitAuditRequest(data) {
    // This is where you would integrate with your backend or email service
    // For now, we'll simulate a successful submission
    
    return new Promise((resolve) => {
        setTimeout(() => {
            // Log the submission data (remove in production)
            console.log('Audit request submitted:', data);
            
            // Store in localStorage for demo purposes
            localStorage.setItem('auditRequest', JSON.stringify(data));
            
            resolve({ success: true, message: 'Audit request submitted successfully' });
        }, 2000);
    });
}

// Analytics and tracking functions
function trackEvent(eventName, properties = {}) {
    // Add your analytics tracking code here (Google Analytics, Mixpanel, etc.)
    console.log('Event tracked:', eventName, properties);
    
    // Example Google Analytics 4 tracking
    if (typeof gtag !== 'undefined') {
        gtag('event', eventName, properties);
    }
}

// Track form interactions
document.addEventListener('DOMContentLoaded', function() {
    // Track form start
    const auditForm = document.getElementById('auditForm');
    if (auditForm) {
        let formStarted = false;
        
        auditForm.addEventListener('input', function() {
            if (!formStarted) {
                trackEvent('form_started', {
                    form_name: 'website_audit'
                });
                formStarted = true;
            }
        });
        
        // Track form submission
        auditForm.addEventListener('submit', function() {
            trackEvent('form_submitted', {
                form_name: 'website_audit'
            });
        });
    }
    
    // Track page views
    trackEvent('page_view', {
        page_title: document.title,
        page_path: window.location.pathname
    });
    
    // Track button clicks
    document.querySelectorAll('.btn').forEach(button => {
        button.addEventListener('click', function() {
            trackEvent('button_click', {
                button_text: this.textContent.trim(),
                button_url: this.href || null
            });
        });
    });
});

// Utility functions
function formatWebsiteUrl(url) {
    if (!url) return '';
    
    // Add https:// if no protocol is specified
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    
    return url;
}

function sanitizeInput(input) {
    // Basic HTML sanitization
    return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<[^>]*>/g, '')
                .trim();
}

// Handle URL parameters on thank you page
if (window.location.pathname.includes('thank-you.html')) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('submitted') === 'true') {
        // Show success animation or message
        document.addEventListener('DOMContentLoaded', function() {
            const successSection = document.querySelector('.success-section');
            if (successSection) {
                successSection.style.animation = 'fadeIn 1s ease-in';
            }
        });
    }
}